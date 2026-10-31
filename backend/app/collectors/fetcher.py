import asyncio
import logging
import time
from collections.abc import Awaitable, Callable
from dataclasses import dataclass
from urllib.parse import urlparse
from urllib.robotparser import RobotFileParser

import httpx

logger = logging.getLogger(__name__)

USER_AGENT = "OtranBot/0.1 (+https://127.0.0.1:8000)"


@dataclass(frozen=True)
class FetchResult:
    status: int
    final_url: str
    html: str


class FetchError(RuntimeError):
    """Raised when a page cannot be fetched or is disallowed."""


class Fetcher:
    def __init__(
        self,
        client: httpx.AsyncClient | None = None,
        *,
        timeout: float = 15.0,
        user_agent: str = USER_AGENT,
        sleep: Callable[[float], Awaitable[None]] = asyncio.sleep,
        clock: Callable[[], float] = time.monotonic,
        robots_ttl: float = 300.0,
    ) -> None:
        self.client = client
        self.timeout = timeout
        self.user_agent = user_agent
        self.sleep = sleep
        self.clock = clock
        self.robots_ttl = robots_ttl
        self._robots: dict[str, tuple[RobotFileParser, float]] = {}
        self._last_request: dict[str, float] = {}

    async def fetch(self, url: str) -> FetchResult:
        parsed = urlparse(url)
        if parsed.scheme not in {"http", "https"} or not parsed.netloc:
            raise FetchError(f"Unsupported URL: {url}")
        if not await self._allowed(url):
            raise FetchError(f"robots.txt disallows {url}")

        domain = parsed.netloc.lower()
        await self._rate_limit(domain)
        last_error: Exception | None = None
        for attempt in range(3):
            try:
                response = await self._request(url)
                response.raise_for_status()
                return FetchResult(response.status_code, str(response.url), response.text)
            except (httpx.HTTPError, OSError) as exc:
                last_error = exc
                if attempt < 2:
                    await self.sleep(0.25 * (2**attempt))
        raise FetchError(f"Failed to fetch {url}: {last_error}") from last_error

    async def _request(self, url: str) -> httpx.Response:
        if self.client is not None:
            return await self.client.get(
                url,
                headers={"User-Agent": self.user_agent},
                timeout=self.timeout,
                follow_redirects=True,
            )
        async with httpx.AsyncClient(
            headers={"User-Agent": self.user_agent},
            timeout=self.timeout,
            follow_redirects=True,
        ) as client:
            return await client.get(url)

    async def _allowed(self, url: str) -> bool:
        parsed = urlparse(url)
        origin = f"{parsed.scheme}://{parsed.netloc}"
        cached = self._robots.get(origin)
        now = self.clock()
        if cached is None or now - cached[1] >= self.robots_ttl:
            parser = RobotFileParser()
            parser.set_url(f"{origin}/robots.txt")
            try:
                await self._load_robots(parser)
            except (httpx.HTTPError, OSError) as exc:
                logger.warning("Could not read robots.txt for %s: %s", origin, exc)
                parser.parse([])
            self._robots[origin] = (parser, now)
        return self._robots[origin][0].can_fetch(self.user_agent, url)

    async def _load_robots(self, parser: RobotFileParser) -> None:
        robots_url = parser.url
        response = await self._request(robots_url)
        if response.status_code == 404:
            parser.parse([])
            return
        response.raise_for_status()
        parser.parse(response.text.splitlines())

    async def _rate_limit(self, domain: str) -> None:
        previous = self._last_request.get(domain)
        if previous is not None:
            wait = 1.0 - (self.clock() - previous)
            if wait > 0:
                await self.sleep(wait)
        self._last_request[domain] = self.clock()


async def fetch(url: str) -> FetchResult:
    """Fetch one public page with the default polite crawler settings."""
    return await Fetcher().fetch(url)
