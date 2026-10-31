from datetime import datetime, timezone

import pytest
from pydantic import BaseModel
from sqlalchemy import create_engine, func, select
from sqlalchemy.orm import Session
from sqlalchemy.pool import StaticPool

from app.agents.extractor import ExtractedClaims, Extractor
from app.db import Base
from app.models.schemas import Analysis, Product, Snapshot
from app.models.tables import ClaimTable, EvidenceTable
from app.services.event_bus import EventBus
from app.services.repository import create_analysis, save_snapshot


@pytest.fixture
def db() -> Session:
    engine = create_engine("sqlite://", connect_args={"check_same_thread": False}, poolclass=StaticPool)
    Base.metadata.create_all(engine)
    with Session(engine) as session:
        yield session


def _snapshot(text: str, snapshot_id: str = "s_1") -> Snapshot:
    return Snapshot(
        id=snapshot_id,
        url="https://acme.example.com/pricing",
        source_type="pricing",
        captured_at=datetime.now(timezone.utc),
        content_hash=f"hash-{snapshot_id}",
        text=text,
    )


def _analysis() -> Analysis:
    return Analysis(
        id="an_1",
        status="running",
        created_at=datetime.now(timezone.utc),
        products=[
            Product(
                id="p_1",
                name="Acme",
                role="ours",
                url="https://acme.example.com",
            )
        ],
        dimensions=["pricing", "features"],
    )


class FakeLLM:
    def __init__(self, results: list[ExtractedClaims]) -> None:
        self.results = results
        self.calls = 0
        self.active_provider = "gemini"

    async def generate_json(self, prompt: str, schema: type[BaseModel], system: str | None = None):
        result = self.results[min(self.calls, len(self.results) - 1)]
        self.calls += 1
        return result


@pytest.mark.asyncio
async def test_quote_location_and_bad_quote_are_handled(db: Session) -> None:
    text = "Pricing\nPro - $8 per user / month\n"
    snapshot = _snapshot(text)
    create_analysis(db, _analysis())
    save_snapshot(db, snapshot)
    llm = FakeLLM(
        [
            ExtractedClaims(
                claims=[
                    {
                        "dimension": "pricing",
                        "statement": "Pro costs $8 per user per month.",
                        "quote": "Pro - $8   per user / month",
                        "data": {"tier": "Pro", "price": 8},
                    },
                    {
                        "dimension": "pricing",
                        "statement": "Not on page",
                        "quote": "Invented quote",
                    },
                ]
            )
        ]
    )
    bus = EventBus()
    claims = await Extractor(db, llm, bus).extract("an_1", "p_1", snapshot, ["pricing"])
    assert len(claims) == 1
    evidence = db.scalars(select(EvidenceTable)).one()
    assert evidence.char_start == text.index("Pro")
    assert evidence.char_end == text.index("month") + len("month")
    assert any(event.level == "warning" for event in bus._history["an_1"])


@pytest.mark.asyncio
async def test_chunks_merge_and_dedupe(db: Session) -> None:
    text = ("Feature X is available.\n" * 500) + "Pricing - $9 per month"
    snapshot = _snapshot(text, "s_long")
    create_analysis(db, _analysis())
    save_snapshot(db, snapshot)
    llm = FakeLLM(
        [
            ExtractedClaims(
                claims=[
                    {
                        "dimension": "features",
                        "statement": "Feature X is available.",
                        "quote": "Feature X is available.",
                    }
                ]
            )
        ]
    )
    claims = await Extractor(db, llm).extract("an_1", "p_1", snapshot, ["features"])
    assert len(claims) == 1
    assert llm.calls > 1
    assert db.scalar(select(func.count()).select_from(ClaimTable)) == 1


@pytest.mark.asyncio
async def test_cache_hit_and_idempotent_save(db: Session) -> None:
    text = "Pro - $8 per user / month"
    snapshot = _snapshot(text, "s_cache")
    create_analysis(db, _analysis())
    save_snapshot(db, snapshot)
    llm = FakeLLM(
        [
            ExtractedClaims(
                claims=[
                    {
                        "dimension": "pricing",
                        "statement": "Pro costs $8 per user per month.",
                        "quote": "Pro - $8 per user / month",
                    }
                ]
            )
        ]
    )
    extractor = Extractor(db, llm)
    first = await extractor.extract("an_1", "p_1", snapshot, ["pricing"])
    second = await extractor.extract("an_1", "p_1", snapshot, ["pricing"])
    assert len(first) == 1
    assert second == []
    assert llm.calls == 1
    assert db.scalar(select(func.count()).select_from(ClaimTable)) == 1
