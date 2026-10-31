from datetime import datetime, timezone

import pytest
from pydantic import BaseModel
from sqlalchemy import create_engine
from sqlalchemy.orm import Session
from sqlalchemy.pool import StaticPool

from app.agents.qa import QAAgent, QADraft
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


class FakeLLM:
    def __init__(self, response: QADraft | Exception) -> None:
        self.response = response
        self.calls = 0

    async def generate_json(self, prompt: str, schema: type[BaseModel], system: str | None = None):
        self.calls += 1
        if isinstance(self.response, Exception):
            raise self.response
        return self.response


def _setup(db: Session) -> None:
    create_analysis(
        db,
        Analysis(
            id="an_q",
            status="completed",
            created_at=datetime.now(timezone.utc),
            products=[Product(id="p_q", name="Acme", role="ours", url="https://acme.example")],
            dimensions=["pricing", "features"],
        ),
    )
    save_snapshot(
        db,
        Snapshot(
            id="s_q",
            url="https://acme.example/pricing",
            captured_at=datetime.now(timezone.utc),
            content_hash="q",
            text="Pro costs $10 per user.",
        ),
    )
    for claim_id, statement, status in [
        ("c_price", "Pro costs $10 per user", "verified"),
        ("c_unverified", "Unverified fact", "unverified"),
        ("c_contradicted", "Contradicted fact", "contradicted"),
    ]:
        save_claim_with_evidence(
            db,
            "an_q",
            Claim(
                id=claim_id,
                product_id="p_q",
                dimension="pricing",
                statement=statement,
                evidence=[
                    Evidence(
                        id=f"e_{claim_id}",
                        quote="Pro costs $10 per user.",
                        source_url="https://acme.example/pricing",
                        source_type="pricing",
                        snapshot_id="s_q",
                        captured_at=datetime.now(timezone.utc),
                    )
                ],
                verification=Verification(status=status, confidence=0.9),
            ),
        )


@pytest.mark.asyncio
async def test_qa_validates_citations_and_excludes_unverified(db: Session) -> None:
    _setup(db)
    llm = FakeLLM(QADraft(answer="It costs $10.", citation_claim_ids=["c_price", "missing"]))
    response = await QAAgent(db, llm).answer("an_q", "What is the price?")
    assert [citation.claim_id for citation in response.citations] == ["c_price"]
    assert response.insufficient_evidence is False
    assert llm.calls == 1
    stored = db.get(ClaimTable, "c_unverified")
    assert stored is not None


@pytest.mark.asyncio
async def test_qa_invalid_only_citations_force_insufficient(db: Session) -> None:
    _setup(db)
    response = await QAAgent(
        db,
        FakeLLM(QADraft(answer="Unknown", citation_claim_ids=["not-a-claim"])),
    ).answer("an_q", "What changed?")
    assert response.citations == []
    assert response.insufficient_evidence is True


@pytest.mark.asyncio
async def test_qa_cache_and_fallback(db: Session) -> None:
    _setup(db)
    llm = FakeLLM(QADraft(answer="It costs $10.", citation_claim_ids=["c_price"]))
    agent = QAAgent(db, llm)
    first = await agent.answer("an_q", "What is the price?")
    second = await agent.answer("an_q", "What is the price?")
    assert first == second
    assert llm.calls == 1

    fallback = await QAAgent(db, FakeLLM(RuntimeError("offline"))).answer("an_q", "price offline")
    assert "Pro costs $10" in fallback.answer
    assert fallback.citations[0].claim_id == "c_price"


@pytest.mark.asyncio
async def test_qa_with_no_verified_claims_is_insufficient(db: Session) -> None:
    _setup(db)
    db.get(ClaimTable, "c_price").verification = {"status": "unverified", "confidence": 0}
    db.commit()
    response = await QAAgent(db, FakeLLM(RuntimeError("offline"))).answer("an_q", "What is the price?")
    assert response.insufficient_evidence is True
    assert response.citations == []
