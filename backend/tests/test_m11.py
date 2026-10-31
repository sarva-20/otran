import asyncio
from pathlib import Path
from typing import Any

import pytest
from pydantic import BaseModel
from sqlalchemy import create_engine
from sqlalchemy.orm import Session
from sqlalchemy.pool import StaticPool

from app.agents.collector import Collector
from app.agents.discovery import Discovery
from app.config import settings
from app.db import Base
from app.llm.router import LLMRouter
from app.services.event_bus import EventBus


@pytest.fixture
def db() -> Session:
    engine = create_engine("sqlite://", connect_args={"check_same_thread": False}, poolclass=StaticPool)
    Base.metadata.create_all(engine)
    with Session(engine) as session:
        yield session


class FakeFetcher:
    def __init__(self, html: str = "<html><body>Real page content</body></html>") -> None:
        self.html = html
        self.calls: list[str] = []

    async def fetch(self, url: str) -> Any:
        self.calls.append(url)
        return type("Result", (), {"final_url": url, "html": self.html})()


@pytest.mark.asyncio
async def test_extra_urls_are_direct_and_no_placeholder_urls(
    db: Session, monkeypatch: pytest.MonkeyPatch
) -> None:
    monkeypatch.setattr(settings, "OFFLINE_DEMO", False)
    fetcher = FakeFetcher(
        "<html><body><a href='/docs'>Docs</a><a href='/pricing'>Pricing</a></body></html>"
    )
    found = await Discovery(fetcher).discover(
        "https://example.test",
        ["https://example.test/pricing-custom", "https://example.test/docs/start"],
    )
    assert "https://example.test/pricing-custom" in found["pricing"]
    assert "https://example.test/docs/start" in found["docs"]
    assert "https://example.test/product_page" not in sum(found.values(), [])
    collector = Collector(db, fetcher=fetcher)
    await collector.collect("an_test", found)
    assert "https://example.test/pricing-custom" in fetcher.calls
    assert "https://example.test/docs/start" in fetcher.calls


@pytest.mark.asyncio
async def test_offline_stub_not_used_when_disabled(
    db: Session, monkeypatch: pytest.MonkeyPatch, tmp_path: Path
) -> None:
    monkeypatch.setattr(settings, "OFFLINE_DEMO", False)
    fetcher = FakeFetcher()
    snapshots = await Collector(db, fetcher=fetcher, seed_root=tmp_path).collect(
        "an_test", [("https://example.test/pricing", "pricing")]
    )
    assert len(snapshots) == 1
    assert fetcher.calls == ["https://example.test/pricing"]


@pytest.mark.asyncio
async def test_missing_seed_has_clear_event(
    db: Session, monkeypatch: pytest.MonkeyPatch, tmp_path: Path
) -> None:
    monkeypatch.setattr(settings, "OFFLINE_DEMO", True)
    bus = EventBus()
    await Collector(db, bus=bus, seed_root=tmp_path).collect(
        "an_test", [("https://example.test/pricing", "pricing")]
    )
    messages = [event.message for event in bus._history["an_test"]]
    assert messages[-1] == "OFFLINE_DEMO is on and no seed file exists for https://example.test/pricing"


class RateLimitedGemini:
    async def generate_json(self, *args: object, **kwargs: object) -> BaseModel:
        error = RuntimeError("429 quota")
        error.status_code = 429  # type: ignore[attr-defined]
        raise error


class CountingOllama:
    def __init__(self) -> None:
        self.calls = 0

    async def generate_json(self, *args: object, **kwargs: object) -> BaseModel:
        self.calls += 1
        raise AssertionError("Ollama must not be called")


@pytest.mark.asyncio
async def test_llm_fallback_false_never_calls_ollama(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setattr(settings, "LLM_FALLBACK", False)
    ollama = CountingOllama()
    router = LLMRouter(RateLimitedGemini(), ollama, retry_attempts=0, sleep=lambda _: asyncio.sleep(0))
    with pytest.raises(RuntimeError, match="LLM_FALLBACK=false"):
        await router.generate_json("prompt", BaseModel)
    assert ollama.calls == 0


@pytest.mark.asyncio
async def test_missing_ollama_model_disables_fallback(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setattr(settings, "LLM_FALLBACK", True)
    monkeypatch.setattr(settings, "OLLAMA_MODEL", "missing")

    class Response:
        def raise_for_status(self) -> None:
            return None

        def json(self) -> dict[str, list[dict[str, str]]]:
            return {"models": [{"name": "other"}]}

    class Client:
        async def __aenter__(self) -> "Client":
            return self

        async def __aexit__(self, *args: object) -> None:
            return None

        async def get(self, url: str) -> Response:
            return Response()

    monkeypatch.setattr("app.llm.router.httpx.AsyncClient", lambda **kwargs: Client())
    router = LLMRouter(RateLimitedGemini(), CountingOllama())
    assert await router.validate_fallback() is False
    with pytest.raises(RuntimeError, match="LLM_FALLBACK=false"):
        await router.generate_json("prompt", BaseModel)


@pytest.mark.asyncio
async def test_per_url_failure_reason_is_preserved(
    db: Session, monkeypatch: pytest.MonkeyPatch
) -> None:
    monkeypatch.setattr(settings, "OFFLINE_DEMO", False)

    class BrokenFetcher:
        async def fetch(self, url: str) -> Any:
            raise RuntimeError("robots.txt disallows " + url)

    bus = EventBus()
    await Collector(db, fetcher=BrokenFetcher(), bus=bus).collect(
        "an_test", [("https://example.test/private", "pricing")]
    )
    assert "robots.txt disallows https://example.test/private" in bus._history["an_test"][-1].message
