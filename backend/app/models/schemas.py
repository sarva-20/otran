from datetime import datetime
from enum import Enum
from typing import Any, Literal

from pydantic import BaseModel, Field, field_validator
from pydantic import HttpUrl

from app.services.event_bus import AgentEvent

class Severity(str, Enum):
    low = "low"
    medium = "medium"
    high = "high"


class AnalysisStatus(str, Enum):
    queued = "queued"
    running = "running"
    completed = "completed"
    failed = "failed"


ProductRole = Literal["ours", "competitor"]
VerificationStatus = Literal["verified", "unverified", "contradicted"]
SourceType = Literal["product_page", "pricing", "docs", "release_notes", "other"]


class Product(BaseModel):
    id: str
    name: str
    role: ProductRole
    url: str


class Error(BaseModel):
    detail: str


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
    sources_collected: int = 0
    claims_total: int = 0
    claims_verified: int = 0
    claims_contradicted: int = 0
    changes_detected: int = 0


class Analysis(BaseModel):
    id: str
    status: AnalysisStatus
    run_number: int = 1
    created_at: datetime
    completed_at: datetime | None = None
    products: list[Product]
    dimensions: list[str]
    stats: AnalysisStats = Field(default_factory=AnalysisStats)


class Verification(BaseModel):
    status: VerificationStatus
    confidence: float = Field(ge=0, le=1)
    reason: str = ""


class Evidence(BaseModel):
    id: str
    quote: str
    source_url: str
    source_type: SourceType = "other"
    snapshot_id: str
    char_start: int = 0
    char_end: int = 0
    captured_at: datetime


class Claim(BaseModel):
    id: str
    product_id: str
    dimension: str
    statement: str
    data: dict[str, Any] = Field(default_factory=dict)
    evidence: list[Evidence] = Field(min_length=1)
    verification: Verification
    first_seen_at: datetime = datetime.min
    last_seen_at: datetime = datetime.min

    @field_validator("data", mode="before")
    @classmethod
    def default_data(cls, value: Any) -> dict[str, Any]:
        return value or {}


class Snapshot(BaseModel):
    id: str
    url: str
    source_type: str = ""
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
    advantage: Literal["ours", "theirs", "parity", "unknown"] = "unknown"


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
    source_url: str = ""
    detected_at: datetime
    claim_ids: list[str] = Field(default_factory=list)


class Battlecard(BaseModel):
    competitor_id: str
    strengths: list[str] = Field(default_factory=list)
    weaknesses: list[str] = Field(default_factory=list)
    counter_points: list[str] = Field(default_factory=list)
    claim_ids: list[str] = Field(default_factory=list)


class Gap(BaseModel):
    dimension: str
    description: str
    severity: Severity
    claim_ids: list[str] = Field(default_factory=list)


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
    history: list[ChatMessage] = Field(default_factory=list)


class Citation(BaseModel):
    claim_id: str
    quote: str = ""
    source_url: str = ""


class ChatResponse(BaseModel):
    answer: str
    citations: list[Citation]
    insufficient_evidence: bool = False


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
    "Error",
    "Gap",
    "Matrix",
    "MatrixCell",
    "Product",
    "ProductInput",
    "Report",
    "Snapshot",
    "Verification",
]
