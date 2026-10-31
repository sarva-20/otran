import asyncio
import json
from pathlib import Path

import httpx
import pytest
from pydantic import BaseModel
from sqlalchemy import create_engine
from sqlalchemy.orm import Session
from sqlalchemy.pool import StaticPool

from app.api.system import llm_router
from app.api.system import Health
from app.db import Base
from app.llm.router import LLMRouter
from app.models.schemas import (
    Analysis,
    Change,
    ChatRequest,
    ChatResponse,
    Claim,
    Matrix,
    Report,
    Snapshot,
)
from app.models.tables import AnalysisTable
from app.services.repository import create_analysis, save_claim_with_evidence, save_snapshot
from app.services.event_bus import AgentEvent, EventBus


@pytest.mark.asyncio
async def test_health() -> None:
    from app.main import app

    async with httpx.AsyncClient(transport=httpx.ASGITransport(app=app), base_url="http://test") as client:
        response = await client.get("/health")
    assert response.status_code == 200
    assert response.json() == {
        "status": "ok",
        "llm_provider": llm_router.active_provider,
        "llm_model": llm_router.active_model,
    }


class Result(BaseModel):
    answer: str


@pytest.mark.asyncio
async def test_router_switches_to_ollama_on_rate_limit() -> None:
    class Gemini:
        calls = 0

        async def generate_json(self, prompt, schema, system=None):
            self.calls += 1
            error = RuntimeError("HTTP 429 quota exceeded")
            error.status_code = 429
            raise error

    class Ollama:
        async def generate_json(self, prompt, schema, system=None):
            return schema(answer="ollama")

    router = LLMRouter(Gemini(), Ollama(), retry_attempts=1, sleep=lambda _: asyncio.sleep(0))
    result = await router.generate_json("hello", Result)
    assert result.answer == "ollama"
    assert router.active_provider == "ollama"


@pytest.mark.asyncio
async def test_event_bus_history_then_live_events() -> None:
    bus = EventBus()
    first = AgentEvent(id=1, ts="2026-10-31T10:00:01Z", agent="orchestrator", level="info", message="first")
    second = AgentEvent(id=2, ts="2026-10-31T10:00:02Z", agent="collector", level="success", message="second")
    bus.publish("a1", first)
    stream = bus.subscribe("a1")
    received = [await stream.__anext__()]
    bus.publish("a1", second)
    received.append(await stream.__anext__())
    await stream.aclose()
    assert [event.id for event in received] == [1, 2]


def test_sample_events_validate() -> None:
    samples = json.loads((Path(__file__).parents[2] / "contracts" / "samples.json").read_text())
    events = [AgentEvent.model_validate(event) for event in samples["events"]]
    assert len(events) == len(samples["events"])


def test_all_sample_models_validate() -> None:
    samples = json.loads((Path(__file__).parents[2] / "contracts" / "samples.json").read_text())
    Health.model_validate(samples["health"])
    Analysis.model_validate(samples["analysis"])
    [AgentEvent.model_validate(event) for event in samples["events"]]
    Matrix.model_validate(samples["matrix"])
    Claim.model_validate(samples["claim"])
    Snapshot.model_validate(samples["snapshot"])
    [Change.model_validate(change) for change in samples["changes"]]
    Report.model_validate(samples["report"])
    ChatRequest.model_validate(samples["chat_request"])
    ChatResponse.model_validate(samples["chat_response"])


@pytest.fixture
def db() -> Session:
    engine = create_engine(
        "sqlite://",
        connect_args={"check_same_thread": False},
        poolclass=StaticPool,
    )
    Base.metadata.create_all(engine)
    with Session(engine) as session:
        yield session


def test_claim_with_evidence_round_trips(db: Session) -> None:
    samples = json.loads((Path(__file__).parents[2] / "contracts" / "samples.json").read_text())
    analysis = Analysis.model_validate(samples["analysis"])
    snapshot = Snapshot.model_validate(samples["snapshot"])
    claim = Claim.model_validate(samples["claim"])
    create_analysis(db, analysis)
    save_snapshot(db, snapshot)
    save_claim_with_evidence(db, analysis.id, claim)
    db.expire_all()
    stored = db.get(AnalysisTable, analysis.id)
    assert stored is not None
    assert stored.claims[0].evidence[0].quote == claim.evidence[0].quote


def test_claim_without_evidence_fails(db: Session) -> None:
    samples = json.loads((Path(__file__).parents[2] / "contracts" / "samples.json").read_text())
    analysis = Analysis.model_validate(samples["analysis"])
    claim = Claim.model_validate(samples["claim"]).model_copy(update={"evidence": []})
    create_analysis(db, analysis)
    with pytest.raises(ValueError, match="at least one evidence"):
        save_claim_with_evidence(db, analysis.id, claim)
