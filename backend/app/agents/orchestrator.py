import asyncio
import logging
from datetime import datetime, timezone
from typing import Any

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.agents.collector import Collector
from app.agents.discovery import Discovery
from app.agents.diff import DiffAgent
from app.agents.extractor import Extractor
from app.agents.analyst import Analyst
from app.agents.verifier import Verifier
from app.collectors.fetcher import Fetcher
from app.config import settings
from app.llm.router import LLMRouter
from app.models.schemas import Snapshot
from app.models.tables import AnalysisTable, ClaimTable, EventTable, ProductTable, SnapshotTable
from app.services.event_bus import AgentEvent, EventBus, event_bus

logger = logging.getLogger(__name__)


class Orchestrator:
    def __init__(
        self,
        db: Session,
        fetcher: Fetcher | None = None,
        llm: LLMRouter | object | None = None,
        bus: EventBus | None = None,
    ) -> None:
        self.db = db
        self.fetcher = fetcher or Fetcher()
        self.llm = llm if llm is not None else (None if settings.OFFLINE_DEMO else LLMRouter())
        self.bus = bus or event_bus
        self._event_id = 0

    async def run_analysis(self, analysis_id: str, rerun: bool = False) -> None:
        analysis = self.db.get(AnalysisTable, analysis_id)
        if analysis is None:
            return
        previous = self._latest_snapshots() if rerun else {}
        self._update_status(analysis, "running", increment=rerun)
        self._emit(analysis_id, "info", "Planning analysis", {"rerun": rerun})
        products = list(analysis.products)
        results: list[Snapshot] = []
        failures = 0
        semaphore = asyncio.Semaphore(2)

        async def run_product(product: ProductTable) -> None:
            nonlocal failures
            async with semaphore:
                try:
                    self._emit(analysis_id, "info", f"Starting product {product.name}", {"product_id": product.id})
                    if settings.OFFLINE_DEMO:
                        discovered = {
                            source_type: [f"{product.url.rstrip('/')}/{source_type}"]
                            for source_type in ("pricing", "product_page", "release_notes")
                        }
                    else:
                        discovered = await Discovery(self.fetcher).discover(product.url, product.extra_urls)
                    snapshots = await Collector(self.db, self.fetcher, self.bus).collect(
                        analysis_id, discovered, run_number=analysis.run_number or 1
                    )
                    logger.info("provider=%s stage=collector product=%s", self._provider(), product.name)
                    for snapshot in snapshots:
                        results.append(snapshot)
                        await Extractor(self.db, self.llm, self.bus).extract(
                            analysis_id, product.id, snapshot, analysis.dimensions
                        )
                    logger.info("provider=%s stage=extractor product=%s", self._provider(), product.name)
                    self._emit(analysis_id, "success", f"Finished product {product.name}", {"product_id": product.id})
                except Exception as exc:
                    failures += 1
                    self._emit(
                        analysis_id,
                        "error",
                        f"Product {product.name} failed: {exc}",
                        {"product_id": product.id},
                    )

        await asyncio.gather(*(run_product(product) for product in products))
        await Verifier(self.db, self.llm, self.bus).verify(analysis_id)
        logger.info("provider=%s stage=verifier analysis=%s", self._provider(), analysis_id)
        changes = []
        if rerun:
            changes = await DiffAgent(self.db, self.llm, self.bus).diff(
                analysis_id,
                list(previous.values()),
                results,
            )
        await Analyst(self.db, self.llm, self.bus).build_report(analysis_id)
        logger.info("provider=%s stage=analyst analysis=%s", self._provider(), analysis_id)
        usable = bool(results or self.db.scalar(select(ClaimTable).where(ClaimTable.analysis_id == analysis_id)))
        self._update_status(analysis, "completed" if usable else "failed")
        self._update_stats(analysis, len(results), len(changes))
        self._emit(
            analysis_id,
            "success" if usable else "error",
            "Analysis completed" if usable else "Analysis failed: no usable data",
            {"changes_detected": len(changes)},
        )
        self._emit_done(analysis_id, "completed" if usable else "failed")
        self._persist_bus_events(analysis_id)

    def _latest_snapshots(self) -> dict[str, Snapshot]:
        rows = self.db.scalars(select(SnapshotTable).order_by(SnapshotTable.captured_at)).all()
        result: dict[str, Snapshot] = {}
        for row in rows:
            result[row.url] = Snapshot.model_validate(
                {
                    "id": row.id,
                    "url": row.url,
                    "source_type": row.source_type,
                    "captured_at": row.captured_at,
                    "content_hash": row.content_hash,
                    "text": row.text,
                }
            )
        return result

    def _update_status(self, analysis: AnalysisTable, status: str, increment: bool = False) -> None:
        analysis.status = status
        if increment:
            analysis.run_number = (analysis.run_number or 1) + 1
        if status in {"completed", "failed"}:
            analysis.completed_at = datetime.now(timezone.utc)
        self.db.add(analysis)
        self.db.commit()

    def _update_stats(self, analysis: AnalysisTable, sources: int, changes: int) -> None:
        claims = list(self.db.scalars(select(ClaimTable).where(ClaimTable.analysis_id == analysis.id)))
        analysis.stats = {
            "sources_collected": sources,
            "claims_total": len(claims),
            "claims_verified": sum(c.verification.get("status") == "verified" for c in claims),
            "claims_contradicted": sum(c.verification.get("status") == "contradicted" for c in claims),
            "changes_detected": changes,
        }
        self.db.add(analysis)
        self.db.commit()

    def _emit(self, analysis_id: str, level: str, message: str, data: dict[str, Any]) -> None:
        self._event_id += 1
        event = AgentEvent(
            id=self._event_id,
            ts=datetime.now(timezone.utc),
            agent="orchestrator",
            step="plan",
            level=level,
            message=message,
            data=data,
        )
        self.bus.publish(analysis_id, event)

    def _persist_bus_events(self, analysis_id: str) -> None:
        existing = {
            (row.ts, row.agent, row.message, row.level)
            for row in self.db.scalars(select(EventTable).where(EventTable.analysis_id == analysis_id))
        }
        for event in self.bus._history.get(analysis_id, []):
            key = (event.ts, event.agent, event.message, event.level)
            if key in existing:
                continue
            self.db.add(
                EventTable(
                    analysis_id=analysis_id,
                    event_id=event.id,
                    ts=event.ts,
                    agent=event.agent,
                    step=event.step,
                    level=event.level,
                    message=event.message,
                    product_id=event.product_id,
                    data=event.data,
                )
            )
        self.db.commit()

    def _emit_done(self, analysis_id: str, status: str) -> None:
        self._emit(analysis_id, "success" if status == "completed" else "error", "done", {"status": status})

    def _provider(self) -> str:
        return getattr(self.llm, "active_provider", "template/offline")


async def run_analysis(
    analysis_id: str,
    rerun: bool = False,
    db: Session | None = None,
    fetcher: Fetcher | None = None,
    llm: LLMRouter | object | None = None,
    bus: EventBus | None = None,
) -> None:
    if db is None:
        from app.db import SessionLocal

        db = SessionLocal()
        try:
            if settings.ORCHESTRATOR == "legacy":
                await Orchestrator(db, fetcher, llm, bus).run_analysis(analysis_id, rerun)
                return
            try:
                from app.agents.graph import run_graph

                await run_graph(db, analysis_id, rerun, fetcher, llm, bus)
            except Exception:
                logger.exception("Graph orchestration failed; falling back to legacy")
                await Orchestrator(db, fetcher, llm, bus).run_analysis(analysis_id, rerun)
        finally:
            db.close()
        return
    await Orchestrator(db, fetcher, llm, bus).run_analysis(analysis_id, rerun)
