import hashlib
import json
import re
from collections import defaultdict
from collections.abc import Sequence
from datetime import datetime, timezone
from typing import Any

from pydantic import BaseModel, Field
from sqlalchemy import select
from sqlalchemy.orm import Session, joinedload

from app.llm.router import LLMRouter
from app.models.schemas import Verification
from app.models.tables import ClaimTable, SnapshotTable
from app.services.event_bus import AgentEvent, EventBus, event_bus
from app.services.repository import (
    get_verification_cache,
    save_verification_cache,
    update_claim_verification,
)

PROMPT_VERSION = "m4-v1"


class SemanticResult(BaseModel):
    claim_id: str
    supports: bool
    contradicts_claim_id: str | None = None
    note: str = ""


class SemanticResults(BaseModel):
    results: list[SemanticResult] = Field(default_factory=list)


class Verifier:
    def __init__(
        self,
        db: Session,
        llm: LLMRouter | object | None = None,
        bus: EventBus | None = None,
    ) -> None:
        self.db = db
        self.llm = llm or LLMRouter()
        self.bus = bus or event_bus
        self._event_id = 0

    async def verify(self, analysis_id: str) -> list[ClaimTable]:
        claims = list(
            self.db.scalars(
                select(ClaimTable)
                .where(ClaimTable.analysis_id == analysis_id)
                .options(joinedload(ClaimTable.evidence))
                .order_by(ClaimTable.product_id, ClaimTable.dimension, ClaimTable.id)
            ).unique()
        )
        groups: dict[tuple[str, str], list[ClaimTable]] = defaultdict(list)
        for claim in claims:
            groups[(claim.product_id, claim.dimension)].append(claim)

        for (product_id, dimension), group in groups.items():
            bases = self._deterministic(group)
            semantic = await self._semantic(group, bases, dimension)
            self._apply(group, bases, semantic)
            summary = {
                "verified": sum(c.verification["status"] == "verified" for c in group),
                "unverified": sum(c.verification["status"] == "unverified" for c in group),
                "contradicted": sum(c.verification["status"] == "contradicted" for c in group),
                "product_id": product_id,
                "dimension": dimension,
            }
            self._emit(
                analysis_id,
                "success",
                f"Verified {product_id}/{dimension}: "
                f"{summary['verified']} verified, {summary['unverified']} unverified, "
                f"{summary['contradicted']} contradicted",
                summary,
            )
        return claims

    def _deterministic(
        self,
        group: Sequence[ClaimTable],
    ) -> dict[str, Verification]:
        result: dict[str, Verification] = {}
        for claim in group:
            exact = False
            for evidence in claim.evidence:
                snapshot = self.db.get(SnapshotTable, evidence.snapshot_id)
                if snapshot and _locate(snapshot.text, evidence.quote) is not None:
                    exact = True
                    break
            confidence = 0.5 if exact else 0.0
            if exact and any(
                evidence.source_type in {"pricing", "docs", "release_notes"}
                for evidence in claim.evidence
            ):
                confidence += 0.2
            result[claim.id] = Verification(
                status="unverified",
                confidence=confidence,
                reason="Exact evidence quote found." if exact else "Evidence quote not found in snapshot.",
            )

        for claim in group:
            if result[claim.id].confidence == 0:
                continue
            if _has_independent_match(claim, group):
                result[claim.id] = result[claim.id].model_copy(
                    update={"confidence": min(1.0, result[claim.id].confidence + 0.15)}
                )
        return result

    async def _semantic(
        self,
        group: Sequence[ClaimTable],
        bases: dict[str, Verification],
        dimension: str,
    ) -> dict[str, SemanticResult]:
        exact_structured = [
            claim
            for claim in group
            if bases[claim.id].confidence >= 0.5 and claim.data
        ]
        if len(group) == 1 and len(exact_structured) == 1:
            return {}
        payload = [
            {
                "claim_id": claim.id,
                "statement": claim.statement,
                "quote": [evidence.quote for evidence in claim.evidence],
                "data": claim.data,
            }
            for claim in group
        ]
        cache_key = hashlib.sha256(
            json.dumps(payload, sort_keys=True, default=str).encode()
        ).hexdigest()
        cached = get_verification_cache(self.db, cache_key, PROMPT_VERSION)
        if cached is None:
            prompt = (
                f"Evaluate these claims for dimension {dimension}. For each claim, say whether "
                "its quote supports it. Identify contradictions by claim id. Return one result "
                "per claim.\n" + json.dumps(payload)
            )
            response = await self.llm.generate_json(prompt, SemanticResults)
            parsed = SemanticResults.model_validate(response)
            raw = [item.model_dump() for item in parsed.results]
            save_verification_cache(self.db, cache_key, PROMPT_VERSION, raw)
        else:
            parsed = SemanticResults.model_validate({"results": cached})
        return {result.claim_id: result for result in parsed.results}

    def _apply(
        self,
        group: Sequence[ClaimTable],
        bases: dict[str, Verification],
        semantic: dict[str, SemanticResult],
    ) -> None:
        contradictions: dict[str, set[str]] = defaultdict(set)
        for result in semantic.values():
            if result.contradicts_claim_id:
                contradictions[result.claim_id].add(result.contradicts_claim_id)
                contradictions[result.contradicts_claim_id].add(result.claim_id)
        for claim in group:
            base = bases[claim.id]
            result = semantic.get(claim.id)
            if claim.id in contradictions:
                ids = ", ".join(sorted(contradictions[claim.id] | {claim.id}))
                verification = Verification(
                    status="contradicted",
                    confidence=min(0.4, base.confidence),
                    reason=f"Conflicts with claim(s): {ids}.",
                )
                self._emit(
                    claim.analysis_id,
                    "warning",
                    f"Contradiction detected between claims: {ids}",
                    {"claim_ids": sorted(contradictions[claim.id] | {claim.id})},
                )
            elif not base.confidence:
                verification = base
            elif result and not result.supports:
                verification = Verification(
                    status="unverified",
                    confidence=min(base.confidence, 0.4),
                    reason=result.note or "Semantic review did not support the claim.",
                )
            else:
                verification = Verification(
                    status="verified" if base.confidence >= 0.6 else "unverified",
                    confidence=base.confidence,
                    reason=(result.note if result else base.reason),
                )
            update_claim_verification(self.db, claim, verification.model_dump())

    def _emit(
        self,
        analysis_id: str,
        level: str,
        message: str,
        data: dict[str, Any],
    ) -> None:
        self._event_id += 1
        self.bus.publish(
            analysis_id,
            AgentEvent(
                id=self._event_id,
                ts=datetime.now(timezone.utc),
                agent="verifier",
                step="verify_claim",
                level=level,
                message=message,
                data=data,
            ),
        )


def _normalise(value: str) -> str:
    return " ".join(value.split()).lower()


def _locate(text: str, quote: str) -> tuple[int, int] | None:
    normalised = _normalise(text)
    target = _normalise(quote)
    start = normalised.find(target)
    return (start, start + len(target)) if target and start >= 0 else None


def _has_independent_match(claim: ClaimTable, group: Sequence[ClaimTable]) -> bool:
    value = _value_key(claim)
    if value is None:
        return False
    urls = {evidence.source_url for evidence in claim.evidence}
    return any(
        other.id != claim.id
        and _value_key(other) == value
        and urls.isdisjoint({evidence.source_url for evidence in other.evidence})
        for other in group
    )


def _value_key(claim: ClaimTable) -> str | None:
    if claim.data:
        return json.dumps(claim.data, sort_keys=True, default=str).lower()
    numbers = re.findall(r"\b\d+(?:\.\d+)?\b", claim.statement)
    return numbers[0] if numbers else None


async def verify(
    db: Session,
    analysis_id: str,
    llm: LLMRouter | object | None = None,
    bus: EventBus | None = None,
) -> list[ClaimTable]:
    return await Verifier(db, llm, bus).verify(analysis_id)
