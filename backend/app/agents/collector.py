import hashlib
import logging
from collections.abc import Iterable, Mapping, Sequence
from datetime import datetime, timezone
from pathlib import Path
from urllib.parse import urlparse
from uuid import uuid4

from sqlalchemy.orm import Session

from app.collectors.cleaner import clean_html
from app.collectors.fetcher import Fetcher
from app.config import settings
from app.models.schemas import Snapshot
from app.services.event_bus import AgentEvent, EventBus, event_bus
from app.services.repository import latest_snapshot_for_url, save_snapshot

logger = logging.getLogger(__name__)


class Collector:
    def __init__(
        self,
        db: Session,
        fetcher: Fetcher | None = None,
        bus: EventBus | None = None,
        seed_root: Path | None = None,
    ) -> None:
        self.db = db
        self.fetcher = fetcher or Fetcher()
        self.bus = bus or event_bus
        self.seed_root = seed_root or Path(__file__).parents[2] / "data" / "seed"
        self._event_id = 0

    async def collect(
        self,
        analysis_id: str,
        urls: Mapping[str, Sequence[str]] | Iterable[tuple[str, str]],
    ) -> list[Snapshot]:
        candidates = (
            [(url, kind) for kind, values in urls.items() for url in values]
            if isinstance(urls, Mapping)
            else list(urls)
        )
        snapshots: list[Snapshot] = []
        for url, source_type in candidates:
            try:
                snapshot = await self._collect_one(analysis_id, url, source_type)
                if snapshot is not None:
                    snapshots.append(snapshot)
            except Exception as exc:
                logger.exception("Collection failed for %s", url)
                self._emit(
                    analysis_id,
                    "error",
                    f"Failed to collect {url}: {exc}",
                    source_type=source_type,
                    data={"url": url},
                )
        return snapshots

    async def _collect_one(self, analysis_id: str, url: str, source_type: str) -> Snapshot | None:
        self._emit(analysis_id, "info", f"Fetching {url}", source_type, {"url": url})
        if settings.OFFLINE_DEMO:
            html = self._load_offline(url, source_type)
            final_url = url
        else:
            result = await self.fetcher.fetch(url)
            html, final_url = result.html, result.final_url
        text = clean_html(html)
        if len(text) < 500:
            fallback_html = await self._playwright_html(final_url)
            if fallback_html:
                text = clean_html(fallback_html)
        content_hash = f"sha256:{hashlib.sha256(text.encode()).hexdigest()}"
        latest = latest_snapshot_for_url(self.db, final_url)
        if latest is not None and latest.content_hash == content_hash:
            self._emit(analysis_id, "success", f"Unchanged snapshot skipped for {final_url}", source_type)
            return Snapshot.model_validate(
                {
                    "id": latest.id,
                    "url": latest.url,
                    "source_type": latest.source_type,
                    "captured_at": latest.captured_at,
                    "content_hash": latest.content_hash,
                    "text": latest.text,
                }
            )
        snapshot = Snapshot(
            id=f"s_{uuid4().hex[:12]}",
            url=final_url,
            source_type=source_type,
            captured_at=datetime.now(timezone.utc),
            content_hash=content_hash,
            text=text,
        )
        save_snapshot(self.db, snapshot)
        self._emit(analysis_id, "success", f"Saved snapshot for {final_url}", source_type)
        return snapshot

    def _load_offline(self, url: str, source_type: str) -> str:
        domain = urlparse(url).netloc.lower()
        path = self.seed_root / domain / f"{source_type}.txt"
        return path.read_text()

    async def _playwright_html(self, url: str) -> str | None:
        try:
            from playwright.async_api import async_playwright
        except ImportError:
            return None
        async with async_playwright() as playwright:
            browser = await playwright.chromium.launch(headless=True)
            try:
                page = await browser.new_page()
                await page.goto(url, wait_until="networkidle", timeout=15_000)
                return await page.content()
            finally:
                await browser.close()

    def _emit(
        self,
        analysis_id: str,
        level: str,
        message: str,
        source_type: str | None = None,
        data: dict[str, object] | None = None,
    ) -> None:
        self._event_id += 1
        self.bus.publish(
            analysis_id,
            AgentEvent(
                id=self._event_id,
                ts=datetime.now(timezone.utc),
                agent="collector",
                step="fetch_page",
                level=level,
                message=message,
                data={"source_type": source_type, **(data or {})},
            ),
        )


async def collect(
    db: Session,
    analysis_id: str,
    urls: Mapping[str, Sequence[str]] | Iterable[tuple[str, str]],
    fetcher: Fetcher | None = None,
    bus: EventBus | None = None,
) -> list[Snapshot]:
    return await Collector(db, fetcher, bus).collect(analysis_id, urls)
