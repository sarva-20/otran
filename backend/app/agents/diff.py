import hashlib
import json
import re
from collections.abc import Sequence
from datetime import datetime, timezone
from typing import Any

from pydantic import BaseModel, Field
from sqlalchemy import select
from sqlalchemy.orm import Session, joinedload

from app.llm.router import LLMRouter
from app.models.schemas import Change, Snapshot
from app.models.tables import ClaimTable, EvidenceTable
from app.services.event_bus import AgentEvent, EventBus, event_bus
from app.services.repository import (
    get_diff_cache,
    save_change,
    save_diff_cache,
)

PROMPT_VERSION = "m5-v1"


class ChangeSummary(BaseModel):
    change_id: str
    summary: str = Field(min_length=1)


class ChangeSummaries(BaseModel):
    changes: list[ChangeSummary] = Field(default_factory=list)


class DiffAgent:
    def __init__(
        self,
        db: Session,
        llm: LLMRouter | object | None = None,
        bus: EventBus | None = None,
    ) -> None:
        self.db = db
        self.llm = llm
        self.bus = bus or event_bus
        self._event_id = 0

    async def diff(
        self,
        analysis_id: str,
        previous_snapshots: Sequence[Snapshot],
        current_snapshots: Sequence[Snapshot],
    ) -> list[Change]:
        before_by_url = {snapshot.url: snapshot for snapshot in previous_snapshots}
        after_by_url = {snapshot.url: snapshot for snapshot in current_snapshots}
        changed_urls = [
            url
            for url, current in after_by_url.items()
            if before_by_url.get(url) is None
            or before_by_url[url].content_hash != current.content_hash
        ]
        unchanged = len(after_by_url) - len(changed_urls)
        self._emit(
            analysis_id,
            "info",
            f"Compared snapshots: {unchanged} unchanged, {len(changed_urls)} changed",
            {"unchanged": unchanged, "changed": len(changed_urls)},
        )
        changes: list[Change] = []
        for url in changed_urls:
            old = before_by_url.get(url)
            new = after_by_url[url]
            old_claims = self._claims_for_snapshot(analysis_id, old.id) if old else []
            new_claims = self._claims_for_snapshot(analysis_id, new.id)
            changes.extend(self._compare_url(old, new, old_claims, new_claims))

        summaries = await self._summaries(changes)
        for change in changes:
            change.summary = summaries.get(change.id, _template_summary(change))
            if self.db.get(type_for_change(), change.id) is None:
                save_change(self.db, analysis_id, change)
            if change.severity == "high":
                self._emit(
                    analysis_id,
                    "warning",
                    f"High-severity change: {change.summary}",
                    {"change_id": change.id, "source_url": change.source_url},
                )
        return changes

    def _claims_for_snapshot(self, analysis_id: str, snapshot_id: str) -> list[ClaimTable]:
        return list(
            self.db.scalars(
                select(ClaimTable)
                .join(EvidenceTable)
                .where(
                    ClaimTable.analysis_id == analysis_id,
                    EvidenceTable.snapshot_id == snapshot_id,
                )
                .options(joinedload(ClaimTable.evidence))
                .order_by(ClaimTable.id)
            ).unique()
        )

    def _compare_url(
        self,
        old: Snapshot | None,
        new: Snapshot,
        old_claims: Sequence[ClaimTable],
        new_claims: Sequence[ClaimTable],
    ) -> list[Change]:
        old_by_key = {_identity(claim, old.source_type if old else None): claim for claim in old_claims}
        new_by_key = {_identity(claim, new.source_type): claim for claim in new_claims}
        changes: list[Change] = []
        now = datetime.now(timezone.utc)
        for key in sorted(new_by_key.keys() - old_by_key.keys()):
            claim = new_by_key[key]
            changes.append(self._make_change("added", claim, None, new, now))
        for key in sorted(old_by_key.keys() - new_by_key.keys()):
            claim = old_by_key[key]
            changes.append(self._make_change("removed", claim, claim, new, now))
        for key in sorted(old_by_key.keys() & new_by_key.keys()):
            before = old_by_key[key]
            after = new_by_key[key]
            if _value(before) != _value(after):
                changes.append(self._make_change("modified", after, before, new, now))
        return changes

    def _make_change(
        self,
        change_type: str,
        claim: ClaimTable,
        before_claim: ClaimTable | None,
        snapshot: Snapshot,
        detected_at: datetime,
    ) -> Change:
        before = _quote(before_claim) if before_claim else None
        after = _quote(claim) if change_type != "removed" else None
        dimension = claim.dimension
        severity = _severity(change_type, dimension, before_claim, claim)
        identity = _identity(claim, snapshot.source_type)
        change_id = "ch_" + hashlib.sha256(
            f"{snapshot.url}:{identity}:{change_type}:{before}:{after}".encode()
        ).hexdigest()[:12]
        return Change(
            id=change_id,
            product_id=claim.product_id,
            dimension=dimension,
            change_type=change_type,  # type: ignore[arg-type]
            severity=severity,  # type: ignore[arg-type]
            summary=_template_summary_values(change_type, before, after),
            before=before,
            after=after,
            source_url=snapshot.url,
            detected_at=detected_at,
            claim_ids=[claim.id if change_type != "removed" else (before_claim.id if before_claim else claim.id)],
        )

    async def _summaries(self, changes: Sequence[Change]) -> dict[str, str]:
        if not changes or self.llm is None:
            return {}
        payload = [change.model_dump(mode="json") for change in changes]
        cache_key = hashlib.sha256(json.dumps(payload, sort_keys=True).encode()).hexdigest()
        cached = get_diff_cache(self.db, cache_key, PROMPT_VERSION)
        if cached is not None:
            return json.loads(cached)
        try:
            result = await self.llm.generate_json(
                "Write one concise human summary per change. Return JSON summaries.\n"
                + json.dumps(payload),
                ChangeSummaries,
            )
            parsed = ChangeSummaries.model_validate(result)
            summaries = {item.change_id: item.summary for item in parsed.changes}
            save_diff_cache(self.db, cache_key, PROMPT_VERSION, json.dumps(summaries))
            return summaries
        except Exception:
            return {}

    def _emit(self, analysis_id: str, level: str, message: str, data: dict[str, Any]) -> None:
        self._event_id += 1
        self.bus.publish(
            analysis_id,
            AgentEvent(
                id=self._event_id,
                ts=datetime.now(timezone.utc),
                agent="diff",
                step="compare_snapshots",
                level=level,
                message=message,
                data=data,
            ),
        )


def _identity(claim: ClaimTable, source_type: str | None) -> str:
    if claim.dimension == "pricing" and claim.data and claim.data.get("tier"):
        return f"tier:{str(claim.data['tier']).strip().lower()}"
    if source_type == "release_notes":
        if claim.data and claim.data.get("version"):
            return f"version:{claim.data['version']}"
        if claim.data and claim.data.get("title"):
            return f"title:{_normalise(str(claim.data['title']))}"
    return f"statement:{_normalise(claim.statement)}"


def _value(claim: ClaimTable) -> str:
    return json.dumps({"statement": claim.statement, "data": claim.data}, sort_keys=True, default=str)


def _quote(claim: ClaimTable | None) -> str | None:
    return claim.evidence[0].quote if claim and claim.evidence else None


def _severity(
    change_type: str,
    dimension: str,
    before: ClaimTable | None,
    after: ClaimTable,
) -> str:
    if dimension == "pricing" or (change_type == "removed" and dimension == "features"):
        return "high"
    if change_type == "added" and (dimension == "features" or after.data and after.data.get("version")):
        return "medium"
    if change_type == "removed" and dimension == "release_cadence":
        return "medium"
    return "low"


def _normalise(value: str) -> str:
    return " ".join(re.sub(r"[^\w\s]", " ", value.lower()).split())


def _template_summary_values(change_type: str, before: str | None, after: str | None) -> str:
    if change_type == "added":
        return f"New claim added: {after}"
    if change_type == "removed":
        return f"Claim removed: {before}"
    return f"Claim changed from {before} to {after}"


def _template_summary(change: Change) -> str:
    return _template_summary_values(change.change_type, change.before, change.after)


def type_for_change() -> type:
    from app.models.tables import ChangeTable

    return ChangeTable


async def diff(
    db: Session,
    analysis_id: str,
    previous_snapshots: Sequence[Snapshot],
    current_snapshots: Sequence[Snapshot],
    llm: LLMRouter | object | None = None,
    bus: EventBus | None = None,
) -> list[Change]:
    return await DiffAgent(db, llm, bus).diff(
        analysis_id, previous_snapshots, current_snapshots
    )
