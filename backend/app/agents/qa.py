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
from app.models.schemas import ChatMessage, ChatResponse, Citation
from app.models.tables import AnalysisTable, ChangeTable, ClaimTable, EventTable
from app.services.event_bus import AgentEvent, EventBus, event_bus
from app.services.repository import get_qa_cache, save_qa_cache

PROMPT_VERSION = "m8-v1"
_TOKEN_RE = re.compile(r"[a-z0-9]+")
_RECENT_TERMS = {"changed", "recent", "new", "cut"}


class QADraft(BaseModel):
    answer: str = ""
    citation_claim_ids: list[str] = Field(default_factory=list)
    insufficient_evidence: bool = False


class QAAgent:
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

    async def answer(
        self,
        analysis_id: str,
        question: str,
        history: Sequence[ChatMessage] | None = None,
    ) -> ChatResponse:
        analysis = self.db.get(AnalysisTable, analysis_id)
        if analysis is None:
            raise ValueError(f"Analysis not found: {analysis_id}")
        claims = self._rank_claims(analysis, question)
        claim_ids = {claim.id for claim in claims}
        payload = {
            "claims": [
                {
                    "id": claim.id,
                    "product": next(
                        (product.name for product in analysis.products if product.id == claim.product_id),
                        claim.product_id,
                    ),
                    "dimension": claim.dimension,
                    "statement": claim.statement,
                    "quote": claim.evidence[0].quote,
                    "source_url": claim.evidence[0].source_url,
                }
                for claim in claims
            ],
            "question": question,
            "history": [message.model_dump() for message in list(history or [])[-4:]],
        }
        cache_key = hashlib.sha256(
            json.dumps(
                {
                    "analysis_id": analysis_id,
                    "question": question,
                    "claims": [claim.id for claim in claims],
                    "claim_hash": hashlib.sha256(
                        json.dumps(payload["claims"], sort_keys=True).encode()
                    ).hexdigest(),
                },
                sort_keys=True,
            ).encode()
        ).hexdigest()
        cached = get_qa_cache(self.db, cache_key, PROMPT_VERSION)
        draft = QADraft.model_validate(cached) if cached is not None else None
        if draft is None and self.llm is not None:
            try:
                draft = QADraft.model_validate(
                    await self.llm.generate_json(
                        "Answer using only the supplied verified claims. "
                        "Every factual sentence must be supported by cited claim ids. "
                        "If evidence is insufficient, say what is missing and set "
                        "insufficient_evidence=true.\n" + json.dumps(payload),
                        QADraft,
                    )
                )
                save_qa_cache(self.db, cache_key, PROMPT_VERSION, draft.model_dump())
            except Exception:
                draft = None
        if draft is None:
            draft = _fallback_draft(claims, question)
        valid_ids = set(claim_ids)
        cited_ids = [claim_id for claim_id in draft.citation_claim_ids if claim_id in valid_ids]
        if not cited_ids:
            draft = draft.model_copy(update={"insufficient_evidence": True})
        citations = [
            Citation(
                claim_id=claim_id,
                quote=next(claim.evidence[0].quote for claim in claims if claim.id == claim_id),
                source_url=next(claim.evidence[0].source_url for claim in claims if claim.id == claim_id),
            )
            for claim_id in cited_ids
        ]
        response = ChatResponse(
            answer=draft.answer,
            citations=citations,
            insufficient_evidence=draft.insufficient_evidence,
        )
        self._emit(
            analysis_id,
            "Answered question",
            {"claim_count": len(claims), "citation_count": len(citations)},
        )
        return response

    def _rank_claims(self, analysis: AnalysisTable, question: str) -> list[ClaimTable]:
        claims = list(
            self.db.scalars(
                select(ClaimTable)
                .where(
                    ClaimTable.analysis_id == analysis.id,
                    ClaimTable.verification["status"].as_string() == "verified",
                )
                .options(joinedload(ClaimTable.evidence))
            ).unique()
        )
        question_tokens = set(_TOKEN_RE.findall(question.lower()))
        recent = bool(question_tokens & _RECENT_TERMS)
        changed_ids = {
            claim_id
            for change in self.db.scalars(
                select(ChangeTable).where(ChangeTable.analysis_id == analysis.id)
            )
            for claim_id in (change.claim_ids or [])
        }
        product_names = {product.id: product.name.lower() for product in analysis.products}

        def score(claim: ClaimTable) -> tuple[int, str]:
            text = " ".join(
                (claim.statement, claim.dimension, product_names.get(claim.product_id, ""))
            ).lower()
            tokens = set(_TOKEN_RE.findall(text))
            value = len(question_tokens & tokens)
            if recent and claim.id in changed_ids:
                value += 4
            return value, claim.id

        return sorted(claims, key=score, reverse=True)[:12]

    def _emit(self, analysis_id: str, message: str, data: dict[str, Any]) -> None:
        self._event_id += 1
        self.bus.publish(
            analysis_id,
            AgentEvent(
                id=self._event_id,
                ts=datetime.now(timezone.utc),
                agent="qa",
                step="answer",
                level="success",
                message=message,
                data=data,
            ),
        )
        event = self.bus._history[analysis_id][-1]
        self.db.add(
            EventTable(
                analysis_id=analysis_id,
                event_id=event.id,
                ts=event.ts,
                agent=event.agent,
                step=event.step,
                level=event.level,
                message=event.message,
                product_id=event.product_id,
                data=event.data,
            )
        )
        self.db.commit()


def _fallback_draft(claims: Sequence[ClaimTable], question: str) -> QADraft:
    if not claims:
        return QADraft(
            answer=f"I don't have verified claims that answer: {question}",
            insufficient_evidence=True,
        )
    return QADraft(
        answer="\n".join(f"- {claim.statement}" for claim in claims[:5]),
        citation_claim_ids=[claim.id for claim in claims[:5]],
        insufficient_evidence=False,
    )


async def answer(
    db: Session,
    analysis_id: str,
    question: str,
    history: Sequence[ChatMessage] | None = None,
    llm: LLMRouter | object | None = None,
    bus: EventBus | None = None,
) -> ChatResponse:
    return await QAAgent(db, llm, bus).answer(analysis_id, question, history)
