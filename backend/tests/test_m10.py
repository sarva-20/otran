from datetime import datetime, timezone

import pytest
from sqlalchemy import create_engine, select
from sqlalchemy.orm import Session
from sqlalchemy.pool import StaticPool

from app.agents.analyst import Analyst
from app.agents.graph import GraphOrchestrator
from app.agents.orchestrator import Orchestrator
from app.db import Base
from app.models.tables import AnalysisTable, ChangeTable, ProductTable
from app.config import settings


def _db() -> Session:
    engine = create_engine("sqlite://", connect_args={"check_same_thread": False}, poolclass=StaticPool)
    Base.metadata.create_all(engine)
    return Session(engine)


def _create(db: Session, analysis_id: str) -> None:
    db.add(
        AnalysisTable(
            id=analysis_id,
            status="queued",
            run_number=1,
            created_at=datetime.now(timezone.utc),
            dimensions=["pricing", "features", "release_cadence"],
            products=[
                ProductTable(
                    id=f"{analysis_id}_our",
                    name="Acme Notes",
                    role="ours",
                    url="https://acmenotes.example.com",
                )
            ],
        )
    )
    db.commit()


@pytest.mark.asyncio
async def test_graph_matches_legacy_and_skips_diff_on_first_run(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    monkeypatch.setattr(settings, "OFFLINE_DEMO", True)
    graph_db = _db()
    legacy_db = _db()
    try:
        _create(graph_db, "graph")
        _create(legacy_db, "legacy")
        await GraphOrchestrator(graph_db).run("graph")
        await Orchestrator(legacy_db).run_analysis("legacy")
        graph_matrix = [cell.model_dump() for cell in Analyst(graph_db).build_matrix("graph").cells]
        legacy_matrix = [cell.model_dump() for cell in Analyst(legacy_db).build_matrix("legacy").cells]
        for matrix in (graph_matrix, legacy_matrix):
            for cell in matrix:
                cell["product_id"] = cell["product_id"].split("_", 1)[-1]
                cell["claim_ids"] = []
                cell["value"] = "; ".join(sorted(cell["value"].split("; ")))
        graph_matrix.sort(key=lambda cell: (cell["product_id"], cell["dimension"]))
        legacy_matrix.sort(key=lambda cell: (cell["product_id"], cell["dimension"]))
        assert graph_matrix == legacy_matrix
        assert not list(graph_db.scalars(select(ChangeTable).where(ChangeTable.analysis_id == "graph")))
    finally:
        graph_db.close()
        legacy_db.close()
