import hashlib
import logging
import re
from collections.abc import Sequence
from datetime import datetime, timezone
from typing import Any
from uuid import uuid4

from pydantic import BaseModel, Field
from sqlalchemy.orm import Session

from app.llm.router import LLMRouter
from app.config import settings
from app.models.schemas import Claim, Evidence, Snapshot, Verification
from app.models.tables import ClaimTable
from app.services.event_bus import AgentEvent, EventBus, event_bus
from app.services.repository import (
    get_extraction_cache,
    save_claim_with_evidence,
    save_extraction_cache,
)

logger = logging.getLogger(__name__)

PROMPT_VERSION = "m3-v1"
CHUNK_SIZE = 6000
CHUNK_OVERLAP = 200


class ExtractedClaim(BaseModel):
    dimension: str
    statement: str
    quote: str
    data: dict[str, Any] | None = None


class ExtractedClaims(BaseModel):
    claims: list[ExtractedClaim] = Field(default_factory=list)


class Extractor:
    def __init__(
        self,
        db: Session,
        llm: LLMRouter | object | None = None,
        bus: EventBus | None = None,
    ) -> None:
        self.db = db
        self.llm = llm or (None if settings.OFFLINE_DEMO else LLMRouter())
        self.bus = bus or event_bus
        self._event_id = 0

    async def extract(
        self,
        analysis_id: str,
        product_id: str,
        snapshot: Snapshot,
        dimensions: Sequence[str],
        chunk_size: int = CHUNK_SIZE,
    ) -> list[Claim]:
        self._emit(
            analysis_id,
            "info",
            f"Started extraction for {snapshot.url}",
            {"snapshot_id": snapshot.id},
        )
        all_results: list[ExtractedClaim] = []
        chunks = _chunks(snapshot.text, chunk_size)
        provider_before = getattr(self.llm, "active_provider", None)
        for chunk_index, chunk in enumerate(chunks):
            cached = get_extraction_cache(
                self.db, snapshot.content_hash, chunk_index, PROMPT_VERSION
            )
            if cached is not None:
                extracted = ExtractedClaims.model_validate({"claims": cached})
            else:
                if settings.OFFLINE_DEMO:
                    extracted = ExtractedClaims(
                        claims=_offline_claims(chunk, snapshot.source_type, dimensions)
                    )
                    save_extraction_cache(
                        self.db,
                        snapshot.content_hash,
                        chunk_index,
                        PROMPT_VERSION,
                        [claim.model_dump() for claim in extracted.claims],
                    )
                    all_results.extend(extracted.claims)
                    continue
                prompt = _build_prompt(snapshot, dimensions, chunk)
                try:
                    result = await self.llm.generate_json(prompt, ExtractedClaims)
                    extracted = ExtractedClaims.model_validate(result)
                except Exception as exc:
                    self._emit(
                        analysis_id,
                        "error",
                        f"Extraction failed for {snapshot.url}: {exc}",
                        {"snapshot_id": snapshot.id, "chunk_index": chunk_index},
                    )
                    continue
                save_extraction_cache(
                    self.db,
                    snapshot.content_hash,
                    chunk_index,
                    PROMPT_VERSION,
                    [claim.model_dump() for claim in extracted.claims],
                )
            all_results.extend(extracted.claims)
            provider_after = getattr(self.llm, "active_provider", None)
            if provider_before and provider_after and provider_after != provider_before:
                self._emit(
                    analysis_id,
                    "warning",
                    f"LLM provider switched from {provider_before} to {provider_after}",
                    {"snapshot_id": snapshot.id},
                )
                provider_before = provider_after

        claims: list[Claim] = []
        dropped = 0
        seen: set[tuple[str, str]] = set()
        for extracted in all_results:
            if extracted.dimension not in dimensions:
                continue
            key = (extracted.dimension, _normalise(extracted.statement).lower())
            if key in seen:
                continue
            seen.add(key)
            location = _locate_quote(snapshot.text, extracted.quote)
            if location is None:
                dropped += 1
                self._emit(
                    analysis_id,
                    "warning",
                    "Dropped extracted claim because its quote was not found",
                    {"snapshot_id": snapshot.id, "quote": extracted.quote},
                )
                continue
            char_start, char_end = location
            claim_id = _claim_id(snapshot.id, product_id, extracted)
            if self.db.get(ClaimTable, claim_id) is not None:
                continue
            now = datetime.now(timezone.utc)
            evidence = Evidence(
                id=f"e_{uuid4().hex[:12]}",
                quote=extracted.quote,
                source_url=snapshot.url,
                source_type=snapshot.source_type,
                snapshot_id=snapshot.id,
                char_start=char_start,
                char_end=char_end,
                captured_at=snapshot.captured_at,
            )
            claim = Claim(
                id=claim_id,
                product_id=product_id,
                dimension=extracted.dimension,
                statement=extracted.statement,
                data=extracted.data,
                evidence=[evidence],
                verification=Verification(status="unverified", confidence=0),
                first_seen_at=now,
                last_seen_at=now,
            )
            save_claim_with_evidence(self.db, analysis_id, claim)
            claims.append(claim)
        self._emit(
            analysis_id,
            "success",
            f"Extracted {len(claims)} claims from {snapshot.url}",
            {"snapshot_id": snapshot.id, "dropped_quotes": dropped},
        )
        return claims

    def _emit(
        self,
        analysis_id: str,
        level: str,
        message: str,
        data: dict[str, object] | None = None,
    ) -> None:
        self._event_id += 1
        self.bus.publish(
            analysis_id,
            AgentEvent(
                id=self._event_id,
                ts=datetime.now(timezone.utc),
                agent="extractor",
                step="extract_claims",
                level=level,
                message=message,
                data=data or {},
            ),
        )


def _chunks(text: str, chunk_size: int = CHUNK_SIZE) -> list[str]:
    if len(text) <= chunk_size:
        return [text]
    chunks: list[str] = []
    start = 0
    while start < len(text):
        end = min(start + chunk_size, len(text))
        chunks.append(text[start:end])
        if end == len(text):
            break
        start = end - CHUNK_OVERLAP
    return chunks


def _build_prompt(snapshot: Snapshot, dimensions: Sequence[str], chunk: str) -> str:
    source_type = snapshot.source_type or "page"
    return f"""Extract factual claims from this {source_type} page chunk.
Requested dimensions: {", ".join(dimensions)}
Return only claims whose dimension is in the requested dimensions.
Rules:
- quote must be copied EXACTLY from the page text, never paraphrased.
- one fact per claim; skip anything not stated on the page.
- for pricing, fill data with tier, price, currency, period, and billing when stated.
- for release notes, make one claim per notable entry and include its date/version in data.

Page text:
{chunk}"""


def _normalise(value: str) -> str:
    return " ".join(value.split())


def _locate_quote(text: str, quote: str) -> tuple[int, int] | None:
    original_tokens = list(re.finditer(r"\S+", text))
    quote_tokens = list(re.finditer(r"\S+", quote))
    if not quote_tokens:
        return None
    normalised_text = " ".join(match.group() for match in original_tokens).lower()
    normalised_quote = " ".join(match.group() for match in quote_tokens).lower()
    start = normalised_text.find(normalised_quote)
    if start < 0:
        return None
    end = start + len(normalised_quote)
    mapping: list[int] = []
    for index, match in enumerate(original_tokens):
        mapping.extend(range(match.start(), match.end()))
        if index < len(original_tokens) - 1:
            mapping.append(match.end())
    return mapping[start], mapping[end - 1] + 1


def _claim_id(snapshot_id: str, product_id: str, claim: ExtractedClaim) -> str:
    key = f"{snapshot_id}:{product_id}:{claim.dimension}:{_normalise(claim.statement).lower()}"
    return f"c_{hashlib.sha256(key.encode()).hexdigest()[:12]}"


def _offline_claims(
    text: str, source_type: str | None, dimensions: Sequence[str]
) -> list[ExtractedClaim]:
    claims: list[ExtractedClaim] = []
    for line in text.splitlines():
        line = line.strip()
        if not line or line.startswith("#"):
            continue
        if "$" in line and "pricing" in dimensions:
            match = re.search(r"(?P<tier>[A-Za-z]+)\s*-\s*\$(?P<price>\d+(?:\.\d+)?)", line)
            if match:
                claims.append(
                    ExtractedClaim(
                        dimension="pricing",
                        statement=line,
                        quote=line,
                        data={
                            "tier": match.group("tier"),
                            "price": float(match.group("price")),
                            "currency": "USD",
                            "period": "user/month",
                            "billing": "annual" if "annual" in line.lower() else "monthly",
                        },
                    )
                )
                continue
        if line.lower().startswith("feature:") and "features" in dimensions:
            statement = line.split(":", 1)[1].strip()
            claims.append(ExtractedClaim(dimension="features", statement=statement, quote=line))
            continue
        if line.lower().startswith("release:") and "release_cadence" in dimensions:
            date = re.search(r"\d{4}-\d{2}-\d{2}", line)
            version = re.search(r"\bv\d+(?:\.\d+)+\b", line, re.I)
            claims.append(
                ExtractedClaim(
                    dimension="release_cadence",
                    statement=line.split(":", 1)[1].strip(),
                    quote=line,
                    data={
                        **({"date": date.group(0)} if date else {}),
                        **({"version": version.group(0)} if version else {}),
                    },
                )
            )
    return claims


async def extract(
    db: Session,
    analysis_id: str,
    product_id: str,
    snapshot: Snapshot,
    dimensions: Sequence[str],
    llm: LLMRouter | object | None = None,
    bus: EventBus | None = None,
    chunk_size: int = CHUNK_SIZE,
) -> list[Claim]:
    return await Extractor(db, llm, bus).extract(
        analysis_id, product_id, snapshot, dimensions, chunk_size
    )
