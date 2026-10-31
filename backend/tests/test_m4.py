from datetime import datetime, timezone

import pytest
from pydantic import BaseModel
from sqlalchemy import create_engine
from sqlalchemy.orm import Session
from sqlalchemy.pool import StaticPool

from app.agents.verifier import SemanticResults, Verifier
from app.db import Base
from app.models.schemas import Analysis, Claim, Evidence, Product, Snapshot, Verification
from app.models.tables import ClaimTable
from app.services.repository import create_analysis, save_claim_with_evidence, save_snapshot


@pytest.fixture
def db() -> Session:
    engine = create_engine("sqlite://", connect_args={"check_same_thread": False}, poolclass=StaticPool)
    Base.metadata.create_all(engine)
    with Session(engine) as session:
        yield session


def _analysis() -> Analysis:
    return Analysis(
        id="an_v",
        status="running",
        created_at=datetime.now(timezone.utc),
        products=[Product(id="p_v", name="Acme", role="ours", url="https://acme.example")],
        dimensions=["pricing"],
    )


def _save_claim(
    db: Session,
    snapshot_id: str,
    claim_id: str,
    quote: str,
    source_url: str,
    data: dict | None = None,
) -> None:
    claim = Claim(
        id=claim_id,
        product_id="p_v",
        dimension="pricing",
        statement=f"{claim_id} statement",
        data=data,
        evidence=[
            Evidence(
                id=f"e_{claim_id}",
                quote=quote,
                source_url=source_url,
                source_type="pricing",
                snapshot_id=snapshot_id,
                captured_at=datetime.now(timezone.utc),
            )
        ],
        verification=Verification(status="unverified", confidence=0),
    )
    save_claim_with_evidence(db, "an_v", claim)


class FakeLLM:
    def __init__(self, response: SemanticResults) -> None:
        self.response = response
        self.calls = 0

    async def generate_json(self, prompt: str, schema: type[BaseModel], system: str | None = None):
        self.calls += 1
        return self.response


@pytest.mark.asyncio
async def test_missing_quote_is_unverified(db: Session) -> None:
    create_analysis(db, _analysis())
    save_snapshot(
        db,
        Snapshot(
            id="s_missing",
            url="https://acme.example/pricing",
            captured_at=datetime.now(timezone.utc),
            content_hash="missing",
            text="Actual page text",
        ),
    )
    _save_claim(db, "s_missing", "c_missing", "not present", "https://acme.example/pricing")
    await Verifier(db, FakeLLM(SemanticResults())).verify("an_v")
    stored = db.get(ClaimTable, "c_missing")
    assert stored.verification["status"] == "unverified"
    assert stored.verification["confidence"] == 0


@pytest.mark.asyncio
async def test_two_source_agreement_raises_confidence(db: Session) -> None:
    create_analysis(db, _analysis())
    for snapshot_id, url in [("s_a", "https://a.example/pricing"), ("s_b", "https://b.example/pricing")]:
        save_snapshot(
            db,
            Snapshot(
                id=snapshot_id,
                url=url,
                captured_at=datetime.now(timezone.utc),
                content_hash=snapshot_id,
                text="Pro costs $8 per month",
            ),
        )
    _save_claim(db, "s_a", "c_a", "Pro costs $8 per month", "https://a.example/pricing", {"tier": "Pro", "price": 8})
    _save_claim(db, "s_b", "c_b", "Pro costs $8 per month", "https://b.example/pricing", {"tier": "Pro", "price": 8})
    await Verifier(db, FakeLLM(SemanticResults())).verify("an_v")
    assert db.get(ClaimTable, "c_a").verification["confidence"] == 0.85
    assert db.get(ClaimTable, "c_b").verification["confidence"] == 0.85


@pytest.mark.asyncio
async def test_contradictory_prices_mark_both(db: Session) -> None:
    create_analysis(db, _analysis())
    for snapshot_id, price in [("s_8", 8), ("s_10", 10)]:
        save_snapshot(
            db,
            Snapshot(
                id=snapshot_id,
                url=f"https://{price}.example/pricing",
                captured_at=datetime.now(timezone.utc),
                content_hash=snapshot_id,
                text=f"Pro costs ${price} per month",
            ),
        )
    _save_claim(db, "s_8", "c_8", "Pro costs $8 per month", "https://8.example/pricing", {"tier": "Pro", "price": 8})
    _save_claim(db, "s_10", "c_10", "Pro costs $10 per month", "https://10.example/pricing", {"tier": "Pro", "price": 10})
    llm = FakeLLM(
        SemanticResults(
            results=[
                {"claim_id": "c_8", "supports": True, "contradicts_claim_id": "c_10", "note": "different price"},
                {"claim_id": "c_10", "supports": True, "contradicts_claim_id": "c_8", "note": "different price"},
            ]
        )
    )
    await Verifier(db, llm).verify("an_v")
    assert db.get(ClaimTable, "c_8").verification["status"] == "contradicted"
    assert db.get(ClaimTable, "c_10").verification["status"] == "contradicted"
    assert db.get(ClaimTable, "c_8").verification["confidence"] <= 0.4


@pytest.mark.asyncio
async def test_single_exact_structured_claim_skips_llm_and_is_idempotent(db: Session) -> None:
    create_analysis(db, _analysis())
    save_snapshot(
        db,
        Snapshot(
            id="s_one",
            url="https://acme.example/pricing",
            captured_at=datetime.now(timezone.utc),
            content_hash="one",
            text="Pro costs $8 per month",
        ),
    )
    _save_claim(db, "s_one", "c_one", "Pro costs $8 per month", "https://acme.example/pricing", {"price": 8})
    llm = FakeLLM(SemanticResults())
    verifier = Verifier(db, llm)
    await verifier.verify("an_v")
    first = db.get(ClaimTable, "c_one").verification.copy()
    await verifier.verify("an_v")
    assert llm.calls == 0
    assert db.get(ClaimTable, "c_one").verification == first


@pytest.mark.asyncio
async def test_semantic_cache_skips_second_call(db: Session) -> None:
    create_analysis(db, _analysis())
    for snapshot_id, claim_id in [("s_1", "c_1"), ("s_2", "c_2")]:
        save_snapshot(
            db,
            Snapshot(
                id=snapshot_id,
                url=f"https://{claim_id}.example/pricing",
                captured_at=datetime.now(timezone.utc),
                content_hash=snapshot_id,
                text="Pro is available",
            ),
        )
        _save_claim(db, snapshot_id, claim_id, "Pro is available", f"https://{claim_id}.example/pricing")
    llm = FakeLLM(
        SemanticResults(
            results=[
                {"claim_id": "c_1", "supports": True},
                {"claim_id": "c_2", "supports": True},
            ]
        )
    )
    await Verifier(db, llm).verify("an_v")
    await Verifier(db, llm).verify("an_v")
    assert llm.calls == 1
