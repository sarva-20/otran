from datetime import datetime, timezone

import pytest
from pydantic import BaseModel
from sqlalchemy import create_engine, func, select
from sqlalchemy.orm import Session
from sqlalchemy.pool import StaticPool

from app.agents.analyst import Analyst
from app.db import Base
from app.models.schemas import Analysis, Claim, Evidence, Product, Snapshot, Verification
from app.models.tables import ReportTable
from app.services.repository import create_analysis, save_claim_with_evidence, save_snapshot


@pytest.fixture
def db() -> Session:
    engine = create_engine("sqlite://", connect_args={"check_same_thread": False}, poolclass=StaticPool)
    Base.metadata.create_all(engine)
    with Session(engine) as session:
        yield session


def _analysis() -> Analysis:
    return Analysis(
        id="an_a",
        status="completed",
        created_at=datetime.now(timezone.utc),
        products=[
            Product(id="ours", name="Ours", role="ours", url="https://ours.example"),
            Product(id="rival", name="Rival", role="competitor", url="https://rival.example"),
        ],
        dimensions=["pricing", "features", "release_cadence", "limits"],
    )


def _save(
    db: Session,
    snapshot_id: str,
    claim_id: str,
    product_id: str,
    dimension: str,
    statement: str,
    data: dict | None,
    status: str,
    confidence: float,
) -> None:
    save_claim_with_evidence(
        db,
        "an_a",
        Claim(
            id=claim_id,
            product_id=product_id,
            dimension=dimension,
            statement=statement,
            data=data,
            evidence=[
                Evidence(
                    id=f"e_{claim_id}",
                    quote=statement,
                    source_url=f"https://{product_id}.example/page",
                    source_type="pricing",
                    snapshot_id=snapshot_id,
                    captured_at=datetime.now(timezone.utc),
                )
            ],
            verification=Verification(status=status, confidence=confidence),
        ),
    )


class FailingLLM:
    async def generate_json(self, prompt: str, schema: type[BaseModel], system: str | None = None):
        raise RuntimeError("offline")


@pytest.mark.asyncio
async def test_matrix_formats_values_statuses_missing_and_advantage(db: Session) -> None:
    create_analysis(db, _analysis())
    save_snapshot(
        db,
        Snapshot(
            id="s_a",
            url="https://ours.example/pricing",
            captured_at=datetime.now(timezone.utc),
            content_hash="a",
            text="",
        ),
    )
    _save(db, "s_a", "c_ours_price", "ours", "pricing", "Pro $10", {"tier": "Pro", "price": 10}, "verified", 0.9)
    _save(db, "s_a", "c_rival_price", "rival", "pricing", "Pro $8", {"tier": "Pro", "price": 8}, "verified", 0.8)
    _save(db, "s_a", "c_rival_bad", "rival", "pricing", "conflict", {"tier": "Pro", "price": 9}, "contradicted", 0.3)
    _save(db, "s_a", "c_rival_unconfirmed", "rival", "features", "AI search", None, "unverified", 0.3)
    _save(db, "s_a", "c_rival_feature", "rival", "features", "Offline mode", None, "verified", 0.8)
    matrix = Analyst(db).build_matrix("an_a")
    rival_price = next(cell for cell in matrix.cells if cell.product_id == "rival" and cell.dimension == "pricing")
    assert rival_price.value == "Pro $8/user/month"
    assert rival_price.verification_status == "contradicted"
    assert rival_price.confidence == 0.3
    assert rival_price.advantage == "theirs"
    missing = next(cell for cell in matrix.cells if cell.product_id == "ours" and cell.dimension == "limits")
    assert missing.value == "No public data found"
    assert missing.verification_status == "missing"
    assert missing.confidence == 0


@pytest.mark.asyncio
async def test_report_filters_invalid_ids_excludes_unverified_and_fallbacks(db: Session) -> None:
    create_analysis(db, _analysis())
    save_snapshot(
        db,
        Snapshot(
            id="s_r",
            url="https://ours.example/pricing",
            captured_at=datetime.now(timezone.utc),
            content_hash="r",
            text="Pro $10",
        ),
    )
    _save(db, "s_r", "c_valid", "ours", "pricing", "Pro $10", {"tier": "Pro", "price": 10}, "verified", 0.9)
    _save(db, "s_r", "c_unverified", "rival", "features", "Maybe AI", None, "unverified", 0.2)
    report = await Analyst(db, FailingLLM()).build_report("an_a")
    assert report.executive_summary == ""
    assert report.gaps == []
    assert "[claim:" not in report.markdown
    assert db.scalar(select(func.count()).select_from(ReportTable)) == 1
    report_again = await Analyst(db, FailingLLM()).build_report("an_a")
    assert report_again.analysis_id == "an_a"
    assert db.scalar(select(func.count()).select_from(ReportTable)) == 1
