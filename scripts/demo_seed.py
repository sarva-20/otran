import asyncio
import os
from datetime import datetime, timezone
from uuid import uuid4

os.environ["OFFLINE_DEMO"] = "true"

from app.agents.orchestrator import run_analysis
from app.db import SessionLocal, init_db
from app.models.tables import AnalysisTable, ProductTable
from app.models.tables import (
    ChangeTable,
    ClaimTable,
    EvidenceTable,
    EventTable,
    ReportTable,
    SnapshotTable,
)


def main() -> None:
    init_db()
    analysis_id = f"demo_{uuid4().hex[:8]}"
    seed_urls = [
        f"https://{domain}/{source_type}"
        for domain in ("acmenotes.example.com", "rivalo.example.com", "nimbusdocs.example.com")
        for source_type in ("pricing", "product_page", "release_notes")
    ]
    with SessionLocal() as db:
        old_demo_ids = [row.id for row in db.query(AnalysisTable).filter(AnalysisTable.id.like("demo_%"))]
        if old_demo_ids:
            old_claim_ids = [
                row.id for row in db.query(ClaimTable).filter(ClaimTable.analysis_id.in_(old_demo_ids))
            ]
            db.query(EvidenceTable).filter(EvidenceTable.claim_id.in_(old_claim_ids)).delete(
                synchronize_session=False
            )
            db.query(ClaimTable).filter(ClaimTable.analysis_id.in_(old_demo_ids)).delete(
                synchronize_session=False
            )
            db.query(ChangeTable).filter(ChangeTable.analysis_id.in_(old_demo_ids)).delete(
                synchronize_session=False
            )
            db.query(ReportTable).filter(ReportTable.analysis_id.in_(old_demo_ids)).delete(
                synchronize_session=False
            )
            db.query(EventTable).filter(EventTable.analysis_id.in_(old_demo_ids)).delete(
                synchronize_session=False
            )
            db.query(AnalysisTable).filter(AnalysisTable.id.in_(old_demo_ids)).delete(
                synchronize_session=False
            )
        db.query(SnapshotTable).filter(SnapshotTable.url.in_(seed_urls)).delete(
            synchronize_session=False
        )
        db.commit()
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
                    ),
                    ProductTable(
                        id=f"{analysis_id}_riv",
                        name="Rivalo",
                        role="competitor",
                        url="https://rivalo.example.com",
                    ),
                    ProductTable(
                        id=f"{analysis_id}_nim",
                        name="Nimbus Docs",
                        role="competitor",
                        url="https://nimbusdocs.example.com",
                    ),
                ],
            )
        )
        db.commit()
        asyncio.run(run_analysis(analysis_id, db=db))
        asyncio.run(run_analysis(analysis_id, rerun=True, db=db))
    print(f"Demo analysis ready: {analysis_id}")


if __name__ == "__main__":
    main()
