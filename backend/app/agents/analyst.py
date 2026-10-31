import hashlib
import json
from collections import defaultdict
from collections.abc import Sequence
from datetime import datetime, timezone
from typing import Any

from pydantic import BaseModel, Field
from sqlalchemy import select
from sqlalchemy.orm import Session, joinedload

from app.llm.router import LLMRouter
from app.models.schemas import (
    Battlecard,
    Change,
    Gap,
    Matrix,
    MatrixCell,
    Product,
    Report,
)
from app.models.tables import AnalysisTable, ChangeTable, ClaimTable
from app.services.event_bus import AgentEvent, EventBus, event_bus
from app.services.repository import (
    get_report_cache,
    replace_report,
    save_report_cache,
)

PROMPT_VERSION = "m6-v1"
STATUS_RANK = {"verified": 0, "unverified": 1, "contradicted": 2}


class ReportDraft(BaseModel):
    executive_summary: str = Field(default="")
    gaps: list[Gap] = Field(default_factory=list)
    battlecards: list[Battlecard] = Field(default_factory=list)


class Analyst:
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

    def build_matrix(self, analysis_id: str) -> Matrix:
        analysis = self.db.get(AnalysisTable, analysis_id)
        if analysis is None:
            raise ValueError(f"Analysis not found: {analysis_id}")
        products = [
            Product(id=row.id, name=row.name, role=row.role, url=row.url)
            for row in analysis.products
        ]
        claims = self._claims(analysis_id)
        grouped: dict[tuple[str, str], list[ClaimTable]] = defaultdict(list)
        for claim in claims:
            grouped[(claim.product_id, claim.dimension)].append(claim)
        cells = [
            MatrixCell(
                product_id=product.id,
                dimension=dimension,
                value=_cell_value(grouped.get((product.id, dimension), [])),
                verification_status=_cell_status(grouped.get((product.id, dimension), [])),
                confidence=_cell_confidence(grouped.get((product.id, dimension), [])),
                claim_ids=[claim.id for claim in grouped.get((product.id, dimension), [])],
                advantage="unknown",
            )
            for product in products
            for dimension in analysis.dimensions
        ]
        for dimension in analysis.dimensions:
            _set_advantages(
                [cell for cell in cells if cell.dimension == dimension],
                products,
                grouped,
                dimension,
            )
        matrix = Matrix(
            analysis_id=analysis_id,
            products=products,
            dimensions=analysis.dimensions,
            cells=cells,
        )
        self._emit(analysis_id, "success", "Matrix built", {"cells": len(cells)})
        return matrix

    async def build_report(self, analysis_id: str) -> Report:
        matrix = self.build_matrix(analysis_id)
        verified_claims = [
            claim
            for claim in self._claims(analysis_id)
            if claim.verification.get("status") == "verified"
        ]
        valid_ids = {claim.id for claim in verified_claims}
        changes = [
            ChangeTableToSchema(row)
            for row in self.db.scalars(
                select(ChangeTable)
                .where(
                    ChangeTable.analysis_id == analysis_id,
                    ChangeTable.severity.in_(["high", "medium"]),
                )
                .order_by(ChangeTable.detected_at.desc())
            )
        ]
        payload = {
            "matrix": matrix.model_dump(mode="json"),
            "verified_claims": [_claim_payload(claim) for claim in verified_claims],
            "changes": [change.model_dump(mode="json") for change in changes],
        }
        draft = await self._generate_draft(payload, valid_ids)
        report = Report(
            analysis_id=analysis_id,
            generated_at=datetime.now(timezone.utc),
            executive_summary=draft.executive_summary[:1200],
            gaps=_filter_gaps(draft.gaps, valid_ids),
            battlecards=_filter_battlecards(draft.battlecards, valid_ids),
            markdown="",
        )
        report.markdown = _render_markdown(report)
        replace_report(self.db, analysis_id, report)
        self._emit(analysis_id, "success", "Report built", {"gaps": len(report.gaps)})
        return report

    def _claims(self, analysis_id: str) -> list[ClaimTable]:
        return list(
            self.db.scalars(
                select(ClaimTable)
                .where(ClaimTable.analysis_id == analysis_id)
                .options(joinedload(ClaimTable.evidence))
                .order_by(ClaimTable.product_id, ClaimTable.dimension, ClaimTable.id)
            ).unique()
        )

    async def _generate_draft(self, payload: dict[str, Any], valid_ids: set[str]) -> ReportDraft:
        if self.llm is None:
            return _fallback_draft(payload, valid_ids)
        cache_key = hashlib.sha256(json.dumps(payload, sort_keys=True).encode()).hexdigest()
        cached = get_report_cache(self.db, cache_key, PROMPT_VERSION)
        if cached is not None:
            return ReportDraft.model_validate(cached)
        try:
            result = await self.llm.generate_json(
                "Create a concise report using only verified claims in this JSON. "
                "Executive summary max 120 words. Every item must cite valid claim_ids. "
                "Do not state unverified or contradicted claims as facts.\n"
                + json.dumps(payload),
                ReportDraft,
            )
            draft = ReportDraft.model_validate(result)
            save_report_cache(self.db, cache_key, PROMPT_VERSION, draft.model_dump())
            return draft
        except Exception:
            return _fallback_draft(payload, valid_ids)

    def _emit(self, analysis_id: str, level: str, message: str, data: dict[str, object]) -> None:
        self._event_id += 1
        self.bus.publish(
            analysis_id,
            AgentEvent(
                id=self._event_id,
                ts=datetime.now(timezone.utc),
                agent="analyst",
                step="build_report" if "Report" in message else "build_matrix",
                level=level,
                message=message,
                data=data,
            ),
        )


def _cell_status(claims: Sequence[ClaimTable]) -> str:
    if not claims:
        return "missing"
    return max(
        (claim.verification.get("status", "unverified") for claim in claims),
        key=lambda status: STATUS_RANK[status],
    )


def _cell_confidence(claims: Sequence[ClaimTable]) -> float:
    return min((float(claim.verification.get("confidence", 0)) for claim in claims), default=0.0)


def _cell_value(claims: Sequence[ClaimTable]) -> str:
    if not claims:
        return "No public data found"
    usable = [claim for claim in claims if claim.verification.get("status") == "verified"] or list(claims)
    dimension = usable[0].dimension
    if dimension == "pricing":
        return "; ".join(_pricing_value(claim) for claim in usable[:3])
    if dimension == "features":
        return "; ".join(claim.statement for claim in usable[:3])
    if dimension == "release_cadence":
        return _cadence(usable)
    return "; ".join(claim.statement for claim in usable[:3])


def _pricing_value(claim: ClaimTable) -> str:
    data = claim.data or {}
    tier = data.get("tier", "Plan")
    price = data.get("price")
    if price is None:
        return claim.statement
    period = str(data.get("period", "user/month")).replace(" ", "/")
    return f"{tier} ${price}/{period}"


def _cadence(claims: Sequence[ClaimTable]) -> str:
    dates: list[datetime] = []
    for claim in claims:
        value = (claim.data or {}).get("date")
        if value:
            try:
                dates.append(datetime.fromisoformat(str(value).replace("Z", "+00:00")))
            except ValueError:
                pass
    if len(dates) < 2:
        return "Irregular"
    days = (max(dates) - min(dates)).days / (len(dates) - 1)
    return "weekly" if days <= 10 else "biweekly" if days <= 21 else "monthly" if days <= 45 else "quarterly" if days <= 120 else "Irregular"


def _set_advantages(
    cells: list[MatrixCell],
    products: Sequence[Product],
    grouped: dict[tuple[str, str], list[ClaimTable]],
    dimension: str,
) -> None:
    ours = next((product for product in products if product.role == "ours"), None)
    if ours is None:
        return
    ours_cell = next(cell for cell in cells if cell.product_id == ours.id)
    ours_cell.advantage = "parity"
    for cell in cells:
        if cell.product_id == ours.id or cell.verification_status == "missing":
            continue
        if dimension == "pricing":
            ours_price = _price(grouped.get((ours.id, dimension), []))
            their_price = _price(grouped.get((cell.product_id, dimension), []))
            cell.advantage = "ours" if ours_price is not None and their_price is not None and ours_price < their_price else "theirs" if ours_price is not None and their_price is not None and their_price < ours_price else "unknown"
        elif dimension == "features":
            ours_features = {claim.statement.lower() for claim in grouped.get((ours.id, dimension), [])}
            their_features = {claim.statement.lower() for claim in grouped.get((cell.product_id, dimension), [])}
            cell.advantage = "ours" if ours_features > their_features else "theirs" if their_features > ours_features else "parity" if ours_features == their_features else "unknown"
        elif dimension == "release_cadence":
            cell.advantage = "theirs" if _cadence_rank(_cell_value(grouped.get((cell.product_id, dimension), []))) < _cadence_rank(_cell_value(grouped.get((ours.id, dimension), []))) else "ours" if _cadence_rank(_cell_value(grouped.get((cell.product_id, dimension), []))) > _cadence_rank(_cell_value(grouped.get((ours.id, dimension), []))) else "parity"


def _price(claims: Sequence[ClaimTable]) -> float | None:
    values = [claim.data.get("price") for claim in claims if claim.data and isinstance(claim.data.get("price"), (int, float))]
    return min(values) if values else None


def _cadence_rank(value: str) -> int:
    return {"weekly": 0, "biweekly": 1, "monthly": 2, "quarterly": 3}.get(value.lower(), 99)


def _claim_payload(claim: ClaimTable) -> dict[str, Any]:
    return {
        "id": claim.id,
        "product_id": claim.product_id,
        "dimension": claim.dimension,
        "statement": claim.statement,
        "data": claim.data,
        "quotes": [evidence.quote for evidence in claim.evidence],
    }


def _filter_gaps(gaps: Sequence[Gap], valid_ids: set[str]) -> list[Gap]:
    return [
        gap.model_copy(update={"claim_ids": [claim_id for claim_id in (gap.claim_ids or []) if claim_id in valid_ids]})
        for gap in gaps
        if gap.claim_ids and all(claim_id in valid_ids for claim_id in gap.claim_ids)
    ]


def _filter_battlecards(cards: Sequence[Battlecard], valid_ids: set[str]) -> list[Battlecard]:
    return [
        card.model_copy(update={"claim_ids": [claim_id for claim_id in (card.claim_ids or []) if claim_id in valid_ids]})
        for card in cards
        if card.claim_ids and all(claim_id in valid_ids for claim_id in card.claim_ids)
    ]


def _fallback_draft(payload: dict[str, Any], valid_ids: set[str]) -> ReportDraft:
    gaps: list[Gap] = []
    for change in payload["changes"]:
        ids = [claim_id for claim_id in change.get("claim_ids", []) if claim_id in valid_ids]
        if ids:
            gaps.append(
                Gap(
                    dimension=change["dimension"],
                    description=change["summary"],
                    severity=change["severity"],
                    claim_ids=ids,
                )
            )
    return ReportDraft(executive_summary="; ".join(gap.description for gap in gaps)[:1200], gaps=gaps)


def _render_markdown(report: Report) -> str:
    lines = ["# Competitive Report", "", "## Summary", report.executive_summary, ""]
    if report.gaps:
        lines += ["## Gaps"]
        for gap in report.gaps:
            citations = " ".join(f"[claim:{claim_id}]" for claim_id in gap.claim_ids or [])
            lines.append(f"- **{gap.dimension} ({gap.severity})**: {gap.description} {citations}".strip())
    if report.battlecards:
        lines += ["", "## Battlecards"]
        for card in report.battlecards:
            citations = " ".join(f"[claim:{claim_id}]" for claim_id in card.claim_ids or [])
            lines.append(f"- {card.competitor_id}: {', '.join(card.strengths or [])} {citations}".strip())
    return "\n".join(lines) + "\n"


def ChangeTableToSchema(row: ChangeTable) -> Change:
    return Change(
        id=row.id,
        product_id=row.product_id,
        dimension=row.dimension,
        change_type=row.change_type,
        severity=row.severity,
        summary=row.summary,
        before=row.before,
        after=row.after,
        source_url=row.source_url,
        detected_at=row.detected_at,
        claim_ids=row.claim_ids,
    )


async def build_report(
    db: Session,
    analysis_id: str,
    llm: LLMRouter | object | None = None,
    bus: EventBus | None = None,
) -> Report:
    return await Analyst(db, llm, bus).build_report(analysis_id)
