from datetime import datetime, timezone

import pytest
from sqlalchemy import create_engine, select
from sqlalchemy.orm import Session
from sqlalchemy.pool import StaticPool

from app.agents.analyst import Analyst
from app.agents.orchestrator import Orchestrator
from app.agents.qa import QAAgent
from app.config import settings
from app.db import Base
from app.models.tables import AnalysisTable, ChangeTable, ProductTable, ReportTable


@pytest.mark.asyncio
async def test_offline_seed_pipeline(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setattr(settings, "OFFLINE_DEMO", True)
    engine = create_engine("sqlite://", connect_args={"check_same_thread": False}, poolclass=StaticPool)
    Base.metadata.create_all(engine)
    with Session(engine) as db:
        analysis_id = "an_m9"
        db.add(
            AnalysisTable(
                id=analysis_id,
                status="queued",
                run_number=1,
                created_at=datetime.now(timezone.utc),
                dimensions=["pricing", "features", "release_cadence"],
                products=[
                    ProductTable(id="p_our", name="Acme Notes", role="ours", url="https://acmenotes.example.com"),
                    ProductTable(id="p_riv", name="Rivalo", role="competitor", url="https://rivalo.example.com"),
                    ProductTable(id="p_nim", name="Nimbus Docs", role="competitor", url="https://nimbusdocs.example.com"),
                ],
            )
        )
        db.commit()
        await Orchestrator(db).run_analysis(analysis_id)
        await Orchestrator(db).run_analysis(analysis_id, rerun=True)

        changes = list(db.scalars(select(ChangeTable).where(ChangeTable.analysis_id == analysis_id)))
        assert any(change.change_type == "modified" and change.severity == "high" for change in changes)
        matrix = Analyst(db).build_matrix(analysis_id)
        assert next(
            cell for cell in matrix.cells if cell.product_id == "p_nim" and cell.dimension == "pricing"
        ).verification_status == "contradicted"
        assert next(
            cell
            for cell in matrix.cells
            if cell.product_id == "p_nim" and cell.dimension == "release_cadence"
        ).verification_status == "missing"
        report = db.scalar(select(ReportTable).where(ReportTable.analysis_id == analysis_id))
        assert report is not None
        assert "[claim:" in report.markdown
        response = await QAAgent(db).answer(
            analysis_id, "What do we know about Nimbus release cadence?"
        )
        assert response.insufficient_evidence is True
