from collections.abc import Mapping, Sequence
from urllib.parse import urljoin, urlparse
from pathlib import Path

from selectolax.parser import HTMLParser

from app.collectors.fetcher import Fetcher

SOURCE_TYPES = ("pricing", "docs", "release_notes", "product_page")
KEYWORDS = {
    "pricing": ("pricing", "price", "plans", "plan"),
    "docs": ("docs", "documentation", "guide", "api"),
    "release_notes": ("changelog", "what's-new", "whats-new", "release", "releases", "blog"),
}
COMMON_PATHS = {
    "pricing": "/pricing",
    "docs": "/docs",
    "release_notes": "/changelog",
}


def offline_discover(
    homepage_url: str,
    extra_urls: Sequence[str] | None,
    seed_root: Path,
) -> dict[str, list[str]]:
    candidates: dict[str, list[str]] = {kind: [] for kind in SOURCE_TYPES}
    for url in extra_urls or []:
        kind, _ = Discovery._classify(url, "")
        candidates[kind].append(url)
    candidates["product_page"].append(homepage_url)
    domain = urlparse(homepage_url).netloc.lower()
    for source_type in SOURCE_TYPES:
        if candidates[source_type]:
            continue
        base = seed_root / domain / f"{source_type}.txt"
        versioned = seed_root / domain / f"{source_type}.v2.txt"
        if base.exists() or versioned.exists():
            candidates[source_type].append(f"{homepage_url.rstrip('/')}/{source_type}")
    return candidates


class Discovery:
    def __init__(self, fetcher: Fetcher | None = None) -> None:
        self.fetcher = fetcher or Fetcher()

    async def discover(
        self,
        homepage_url: str,
        extra_urls: Sequence[str] | None = None,
    ) -> dict[str, list[str]]:
        candidates: dict[str, list[tuple[int, str]]] = {kind: [] for kind in SOURCE_TYPES}
        candidates["product_page"].append((100, homepage_url))
        for url in extra_urls or []:
            self._add(candidates, self._classify(url, ""), url, 90)

        try:
            result = await self.fetcher.fetch(homepage_url)
        except Exception:
            result = None
        if result is not None:
            parser = HTMLParser(result.html)
            for link in parser.css("a"):
                href = link.attributes.get("href")
                if not href:
                    continue
                url = urljoin(result.final_url, href)
                if urlparse(url).netloc != urlparse(homepage_url).netloc:
                    continue
                anchor = link.text(separator=" ", strip=True)
                kind, score = self._classify(url, anchor)
                self._add(candidates, (kind, score), url, score)

        for kind, path in COMMON_PATHS.items():
            if not candidates[kind]:
                self._add(candidates, (kind, 1), urljoin(homepage_url, path), 1)
        return {
            kind: [url for _, url in sorted(values, key=lambda item: (-item[0], item[1]))[:2]]
            for kind, values in candidates.items()
        }

    @staticmethod
    def _classify(url: str, anchor: str) -> tuple[str, int]:
        haystack = f"{url} {anchor}".lower()
        scores = {
            kind: sum(3 if keyword in url.lower() else 1 for keyword in keywords if keyword in haystack)
            for kind, keywords in KEYWORDS.items()
        }
        kind, score = max(scores.items(), key=lambda item: item[1])
        return (kind, score) if score else ("product_page", 1)

    @staticmethod
    def _add(
        candidates: dict[str, list[tuple[int, str]]],
        classified: tuple[str, int],
        url: str,
        score: int,
    ) -> None:
        kind, classified_score = classified
        values = candidates[kind]
        if not any(existing_url == url for _, existing_url in values):
            values.append((max(score, classified_score), url))


async def discover(
    homepage_url: str,
    extra_urls: Sequence[str] | None = None,
    fetcher: Fetcher | None = None,
) -> Mapping[str, list[str]]:
    return await Discovery(fetcher).discover(homepage_url, extra_urls)
