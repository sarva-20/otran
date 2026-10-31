import asyncio

import httpx
import pytest
from sqlalchemy import create_engine
from sqlalchemy.orm import Session
from sqlalchemy.pool import StaticPool

from app.agents.collector import Collector
from app.agents.discovery import Discovery
from app.collectors.cleaner import clean_html
from app.collectors.fetcher import FetchError, Fetcher
from app.db import Base
from app.models.tables import SnapshotTable
from app.services.event_bus import EventBus


HTML = """\
<html><body>
<h1>Acme Notes</h1>
<a href="/pricing">Plans and pricing</a>
<a href="/docs/getting-started">Documentation</a>
<a href="/changelog">What's new</a>
<a href="/about">About</a>
<table><tr><th>Plan</th><th>Price</th></tr>
<tr><td>Pro</td><td>$8 per user / month</td></tr></table>
</body></html>
"""


@pytest.fixture
def db() -> Session:
    engine = create_engine("sqlite://", connect_args={"check_same_thread": False}, poolclass=StaticPool)
    Base.metadata.create_all(engine)
    with Session(engine) as session:
        yield session


def test_cleaner_preserves_pricing_rows() -> None:
    text = clean_html(HTML)
    assert "Pro - $8 per user / month" in text
    assert "Acme Notes" in text


@pytest.mark.asyncio
async def test_discovery_scores_linked_pages() -> None:
    async def handler(request: httpx.Request) -> httpx.Response:
        if request.url.path == "/robots.txt":
            return httpx.Response(404)
        return httpx.Response(200, text=HTML, request=request)

    async with httpx.AsyncClient(transport=httpx.MockTransport(handler)) as client:
        fetcher = Fetcher(client=client, sleep=lambda _: asyncio.sleep(0))
        found = await Discovery(fetcher).discover("https://acme.example.com")
    assert found["pricing"] == ["https://acme.example.com/pricing"]
    assert found["docs"][0] == "https://acme.example.com/docs/getting-started"
    assert found["release_notes"] == ["https://acme.example.com/changelog"]


@pytest.mark.asyncio
async def test_robots_disallow_is_respected() -> None:
    requested: list[str] = []

    async def handler(request: httpx.Request) -> httpx.Response:
        requested.append(request.url.path)
        if request.url.path == "/robots.txt":
            return httpx.Response(200, text="User-agent: *\nDisallow: /private\n", request=request)
        return httpx.Response(200, text=HTML, request=request)

    async with httpx.AsyncClient(transport=httpx.MockTransport(handler)) as client:
        fetcher = Fetcher(client=client, sleep=lambda _: asyncio.sleep(0))
        with pytest.raises(FetchError, match="robots.txt disallows"):
            await fetcher.fetch("https://acme.example.com/private")
    assert requested == ["/robots.txt"]


class FakeFetcher:
    def __init__(self) -> None:
        self.calls: list[str] = []

    async def fetch(self, url: str):
        self.calls.append(url)
        if url.endswith("/bad"):
            raise FetchError("connection failed")
        return type("Result", (), {"status": 200, "final_url": url, "html": HTML})()


@pytest.mark.asyncio
async def test_collector_skips_unchanged_hash_and_continues_after_failure(db: Session) -> None:
    bus = EventBus()
    fetcher = FakeFetcher()
    collector = Collector(db, fetcher=fetcher, bus=bus)
    first = await collector.collect(
        "an_1",
        [("https://acme.example.com/good", "product_page")],
    )
    second = await collector.collect(
        "an_1",
        [
            ("https://acme.example.com/bad", "product_page"),
            ("https://acme.example.com/good", "product_page"),
        ],
    )
    assert len(first) == len(second) == 1
    assert db.query(SnapshotTable).count() == 1
    events = bus._history["an_1"]
    assert any(event.level == "error" for event in events)
    assert any("Unchanged snapshot skipped" in event.message for event in events)
    assert fetcher.calls == [
        "https://acme.example.com/good",
        "https://acme.example.com/bad",
        "https://acme.example.com/good",
    ]
