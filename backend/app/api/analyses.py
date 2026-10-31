import asyncio
import json
from collections.abc import AsyncIterator
from datetime import datetime, timezone
from uuid import uuid4

from fastapi import APIRouter, BackgroundTasks, Depends, HTTPException, Path, Query
from fastapi.responses import PlainTextResponse, StreamingResponse
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.agents.orchestrator import run_analysis
from app.agents.qa import answer as answer_question
from app.db import SessionLocal, get_db
from app.models.schemas import (
    Analysis,
    AnalysisCreate,
    AgentEvent,
    Change,
    ChatRequest,
    ChatResponse,
    Matrix,
    Product,
    Error,
    Report,
)
from app.models.tables import AnalysisTable, ChangeTable, EventTable, ProductTable, ReportTable
from app.services.event_bus import event_bus

router = APIRouter()


def _analysis(row: AnalysisTable) -> Analysis:
    return Analysis(
        id=row.id,
        status=row.status,
        run_number=row.run_number,
        created_at=row.created_at,
        completed_at=row.completed_at,
        products=[Product(id=p.id, name=p.name, role=p.role, url=p.url) for p in row.products],
        dimensions=row.dimensions,
        stats=row.stats,
    )


def _not_found(message: str) -> HTTPException:
    return HTTPException(status_code=404, detail=message)


@router.post("/api/analyses", response_model=Analysis, status_code=202)
def create(
    payload: AnalysisCreate,
    background_tasks: BackgroundTasks,
    db: Session = Depends(get_db),
) -> Analysis:
    analysis_id = f"an_{uuid4().hex[:8]}"
    products = [payload.our_product, *payload.competitors]
    row = AnalysisTable(
        id=analysis_id,
        status="queued",
        run_number=1,
        created_at=datetime.now(timezone.utc),
        dimensions=payload.dimensions,
        products=[
            ProductTable(
                id=f"p_{uuid4().hex[:8]}",
                name=product.name,
                role="ours" if index == 0 else "competitor",
                url=str(product.url),
                extra_urls=[str(url) for url in product.extra_urls],
            )
            for index, product in enumerate(products)
        ],
    )
    db.add(row)
    db.commit()
    db.refresh(row)
    background_tasks.add_task(_run_background, analysis_id)
    return _analysis(row)


def _run_background(analysis_id: str, rerun: bool = False) -> None:
    db = SessionLocal()
    try:
        asyncio.run(run_analysis(analysis_id, rerun=rerun, db=db))
    finally:
        db.close()


@router.get("/api/analyses", response_model=list[Analysis])
def list_analyses(db: Session = Depends(get_db)) -> list[Analysis]:
    return [_analysis(row) for row in db.scalars(select(AnalysisTable).order_by(AnalysisTable.created_at.desc()))]


@router.get("/api/analyses/{analysisId}", response_model=Analysis, responses={404: {"model": Error}})
def get_analysis(analysis_id: str = Path(..., alias="analysisId"), db: Session = Depends(get_db)) -> Analysis:
    row = db.get(AnalysisTable, analysis_id)
    if row is None:
        raise _not_found("Analysis not found")
    return _analysis(row)


@router.get(
    "/api/analyses/{analysisId}/events",
    response_model=AgentEvent,
    responses={404: {"model": Error}},
)
async def events(analysis_id: str = Path(..., alias="analysisId"), db: Session = Depends(get_db)) -> StreamingResponse:
    if db.get(AnalysisTable, analysis_id) is None:
        raise _not_found("Analysis not found")
    history = list(
        db.scalars(select(EventTable).where(EventTable.analysis_id == analysis_id).order_by(EventTable.id))
    )

    async def stream() -> AsyncIterator[str]:
        seen: set[tuple[str, str, str]] = set()
        for row in history:
            event_key = (row.message, row.ts.isoformat(), row.level)
            seen.add(event_key)
            if row.message == "done":
                yield f"event: done\ndata: {json.dumps(row.data)}\n\n"
                return
            else:
                yield f"event: agent_event\ndata: {json.dumps(_event_data(row))}\n\n"
        async for event in event_bus.subscribe(analysis_id):
            event_key = (event.message, event.ts.isoformat(), event.level)
            if event_key in seen:
                continue
            if event.message == "done":
                yield f"event: done\ndata: {json.dumps(event.data)}\n\n"
                return
            yield f"event: agent_event\ndata: {event.model_dump_json()}\n\n"

    return StreamingResponse(stream(), media_type="text/event-stream")


def _event_data(row: EventTable) -> dict[str, object]:
    return {
        "id": row.event_id,
        "ts": row.ts.isoformat(),
        "agent": row.agent,
        "step": row.step,
        "level": row.level,
        "message": row.message,
        "product_id": row.product_id,
        "data": row.data,
    }


@router.get("/api/analyses/{analysisId}/matrix", response_model=Matrix, responses={404: {"model": Error}})
def matrix(analysis_id: str = Path(..., alias="analysisId"), db: Session = Depends(get_db)) -> Matrix:
    _require_analysis(db, analysis_id)
    from app.agents.analyst import Analyst

    return Analyst(db).build_matrix(analysis_id)


@router.get("/api/analyses/{analysisId}/changes", response_model=list[Change], responses={404: {"model": Error}})
def changes(
    analysis_id: str = Path(..., alias="analysisId"),
    product_id: str | None = None,
    severity: str | None = Query(default=None),
    db: Session = Depends(get_db),
) -> list[Change]:
    _require_analysis(db, analysis_id)
    statement = select(ChangeTable).where(ChangeTable.analysis_id == analysis_id)
    if product_id:
        statement = statement.where(ChangeTable.product_id == product_id)
    if severity:
        statement = statement.where(ChangeTable.severity == severity)
    return [Change.model_validate(row, from_attributes=True) for row in db.scalars(statement.order_by(ChangeTable.detected_at.desc()))]


@router.post("/api/analyses/{analysisId}/rerun", response_model=Analysis, status_code=202, responses={404: {"model": Error}})
def rerun(
    background_tasks: BackgroundTasks,
    analysis_id: str = Path(..., alias="analysisId"),
    db: Session = Depends(get_db),
) -> Analysis:
    row = _require_analysis(db, analysis_id)
    row.status = "queued"
    db.add(row)
    db.commit()
    background_tasks.add_task(_run_background, analysis_id, True)
    return _analysis(row)


@router.get("/api/analyses/{analysisId}/report", response_model=Report, responses={404: {"model": Error}})
def report(
    analysis_id: str = Path(..., alias="analysisId"),
    format: str = Query(default="json", pattern="^(json|md)$"),
    db: Session = Depends(get_db),
) -> Report | PlainTextResponse:
    _require_analysis(db, analysis_id)
    row = db.scalar(select(ReportTable).where(ReportTable.analysis_id == analysis_id).order_by(ReportTable.generated_at.desc()))
    if row is None:
        raise _not_found("Report not found")
    result = Report(
        analysis_id=row.analysis_id,
        generated_at=row.generated_at,
        executive_summary=row.executive_summary,
        gaps=row.gaps,
        battlecards=row.battlecards,
        markdown=row.markdown,
    )
    return PlainTextResponse(result.markdown, media_type="text/markdown") if format == "md" else result


@router.post("/api/analyses/{analysisId}/chat", response_model=ChatResponse, responses={404: {"model": Error}})
async def chat(payload: ChatRequest, analysis_id: str = Path(..., alias="analysisId"), db: Session = Depends(get_db)) -> ChatResponse:
    _require_analysis(db, analysis_id)
    return await answer_question(db, analysis_id, payload.question, payload.history)


def _require_analysis(db: Session, analysis_id: str) -> AnalysisTable:
    row = db.get(AnalysisTable, analysis_id)
    if row is None:
        raise _not_found("Analysis not found")
    return row
