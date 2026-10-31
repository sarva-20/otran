from datetime import datetime
from typing import Any, Literal

from pydantic import BaseModel, Field
from pydantic import HttpUrl

from app.services.event_bus import AgentEvent

Severity = Literal["low", "medium", "high"]
AnalysisStatus = Literal["queued", "running", "completed", "failed"]
ProductRole = Literal["ours", "competitor"]
VerificationStatus = Literal["verified", "unverified", "contradicted"]
SourceType = Literal["product_page", "pricing", "docs", "release_notes", "other"]


class Product(BaseModel):
    id: str
    name: str
    role: ProductRole
    url: str


class ProductInput(BaseModel):
    name: str
    url: HttpUrl
    extra_urls: list[HttpUrl] = Field(default_factory=list)


class AnalysisCreate(BaseModel):
    our_product: ProductInput
    competitors: list[ProductInput] = Field(min_length=1, max_length=4)
    dimensions: list[str] = Field(
        default_factory=lambda: ["pricing", "features", "integrations", "limits", "release_cadence"]
    )


class AnalysisStats(BaseModel):
    sources_collected: int | None = None
    claims_total: int | None = None
    claims_verified: int | None = None
    claims_contradicted: int | None = None
    changes_detected: int | None = None


class Analysis(BaseModel):
    id: str
    status: AnalysisStatus
    run_number: int | None = None
    created_at: datetime
    completed_at: datetime | None = None
    products: list[Product]
    dimensions: list[str]
    stats: AnalysisStats | None = None


class Verification(BaseModel):
    status: VerificationStatus
    confidence: float = Field(ge=0, le=1)
    reason: str | None = None


class Evidence(BaseModel):
    id: str
    quote: str
    source_url: str
    source_type: SourceType | None = None
    snapshot_id: str
    char_start: int | None = None
    char_end: int | None = None
    captured_at: datetime


class Claim(BaseModel):
    id: str
    product_id: str
    dimension: str
    statement: str
    data: dict[str, Any] | None = None
    evidence: list[Evidence] = Field(min_length=1)
    verification: Verification
    first_seen_at: datetime | None = None
    last_seen_at: datetime | None = None


class Snapshot(BaseModel):
    id: str
    url: str
    source_type: str | None = None
    captured_at: datetime
    content_hash: str
    text: str


class MatrixCell(BaseModel):
    product_id: str
    dimension: str
    value: str
    verification_status: Literal["verified", "unverified", "contradicted", "missing"]
    confidence: float = Field(ge=0, le=1)
    claim_ids: list[str]
    advantage: Literal["ours", "theirs", "parity", "unknown"] | None = None


class Matrix(BaseModel):
    analysis_id: str
    products: list[Product]
    dimensions: list[str]
    cells: list[MatrixCell]


class Change(BaseModel):
    id: str
    product_id: str
    dimension: str
    change_type: Literal["added", "removed", "modified"]
    severity: Severity
    summary: str
    before: str | None = None
    after: str | None = None
    source_url: str
    detected_at: datetime
    claim_ids: list[str] | None = None


class Battlecard(BaseModel):
    competitor_id: str
    strengths: list[str] | None = None
    weaknesses: list[str] | None = None
    counter_points: list[str] | None = None
    claim_ids: list[str] | None = None


class Gap(BaseModel):
    dimension: str
    description: str
    severity: Severity
    claim_ids: list[str] | None = None


class Report(BaseModel):
    analysis_id: str
    generated_at: datetime
    executive_summary: str
    gaps: list[Gap]
    battlecards: list[Battlecard]
    markdown: str


class ChatMessage(BaseModel):
    role: Literal["user", "assistant"]
    content: str


class ChatRequest(BaseModel):
    question: str
    history: list[ChatMessage] | None = None


class Citation(BaseModel):
    claim_id: str
    quote: str | None = None
    source_url: str | None = None


class ChatResponse(BaseModel):
    answer: str
    citations: list[Citation]
    insufficient_evidence: bool | None = None


__all__ = [
    "AgentEvent",
    "AnalysisCreate",
    "Analysis",
    "AnalysisStats",
    "Battlecard",
    "Change",
    "ChatRequest",
    "ChatResponse",
    "Claim",
    "Evidence",
    "Gap",
    "Matrix",
    "MatrixCell",
    "Product",
    "ProductInput",
    "Report",
    "Snapshot",
    "Verification",
]
