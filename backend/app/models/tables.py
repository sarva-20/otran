from datetime import datetime
from typing import Any

from sqlalchemy import DateTime, ForeignKey, Integer, JSON, String, Text, event
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.db import Base


class AnalysisTable(Base):
    __tablename__ = "analyses"

    id: Mapped[str] = mapped_column(String, primary_key=True)
    status: Mapped[str] = mapped_column(String, nullable=False)
    run_number: Mapped[int | None] = mapped_column(Integer)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)
    completed_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    dimensions: Mapped[list[str]] = mapped_column(JSON, nullable=False, default=list)
    stats: Mapped[dict[str, Any] | None] = mapped_column(JSON)
    products: Mapped[list["ProductTable"]] = relationship(
        back_populates="analysis", cascade="all, delete-orphan"
    )
    claims: Mapped[list["ClaimTable"]] = relationship(back_populates="analysis")
    changes: Mapped[list["ChangeTable"]] = relationship(back_populates="analysis")
    reports: Mapped[list["ReportTable"]] = relationship(back_populates="analysis")
    events: Mapped[list["EventTable"]] = relationship(back_populates="analysis")


class ProductTable(Base):
    __tablename__ = "products"

    id: Mapped[str] = mapped_column(String, primary_key=True)
    analysis_id: Mapped[str] = mapped_column(ForeignKey("analyses.id"), primary_key=True)
    name: Mapped[str] = mapped_column(String, nullable=False)
    role: Mapped[str] = mapped_column(String, nullable=False)
    url: Mapped[str] = mapped_column(String, nullable=False)
    extra_urls: Mapped[list[str]] = mapped_column(JSON, nullable=False, default=list)
    analysis: Mapped[AnalysisTable] = relationship(back_populates="products")


class SnapshotTable(Base):
    __tablename__ = "snapshots"

    id: Mapped[str] = mapped_column(String, primary_key=True)
    url: Mapped[str] = mapped_column(String, nullable=False, index=True)
    source_type: Mapped[str | None] = mapped_column(String)
    captured_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)
    content_hash: Mapped[str] = mapped_column(String, nullable=False)
    text: Mapped[str] = mapped_column(Text, nullable=False)
    evidence: Mapped[list["EvidenceTable"]] = relationship(back_populates="snapshot")


@event.listens_for(SnapshotTable, "before_update")
def prevent_snapshot_update(mapper: object, connection: object, target: SnapshotTable) -> None:
    raise ValueError("Snapshots are immutable")


class ClaimTable(Base):
    __tablename__ = "claims"

    id: Mapped[str] = mapped_column(String, primary_key=True)
    analysis_id: Mapped[str] = mapped_column(ForeignKey("analyses.id"), nullable=False)
    product_id: Mapped[str] = mapped_column(String, nullable=False)
    dimension: Mapped[str] = mapped_column(String, nullable=False)
    statement: Mapped[str] = mapped_column(Text, nullable=False)
    data: Mapped[dict[str, Any] | None] = mapped_column(JSON)
    verification: Mapped[dict[str, Any]] = mapped_column(JSON, nullable=False)
    first_seen_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    last_seen_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    analysis: Mapped[AnalysisTable] = relationship(back_populates="claims")
    evidence: Mapped[list["EvidenceTable"]] = relationship(
        back_populates="claim", cascade="all, delete-orphan"
    )


class EvidenceTable(Base):
    __tablename__ = "evidence"

    id: Mapped[str] = mapped_column(String, primary_key=True)
    claim_id: Mapped[str] = mapped_column(ForeignKey("claims.id"), nullable=False)
    quote: Mapped[str] = mapped_column(Text, nullable=False)
    source_url: Mapped[str] = mapped_column(String, nullable=False)
    source_type: Mapped[str | None] = mapped_column(String)
    snapshot_id: Mapped[str] = mapped_column(ForeignKey("snapshots.id"), nullable=False)
    char_start: Mapped[int | None] = mapped_column(Integer)
    char_end: Mapped[int | None] = mapped_column(Integer)
    captured_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)
    claim: Mapped[ClaimTable] = relationship(back_populates="evidence")
    snapshot: Mapped[SnapshotTable] = relationship(back_populates="evidence")


class ChangeTable(Base):
    __tablename__ = "changes"

    id: Mapped[str] = mapped_column(String, primary_key=True)
    analysis_id: Mapped[str] = mapped_column(ForeignKey("analyses.id"), nullable=False)
    product_id: Mapped[str] = mapped_column(String, nullable=False)
    dimension: Mapped[str] = mapped_column(String, nullable=False)
    change_type: Mapped[str] = mapped_column(String, nullable=False)
    severity: Mapped[str] = mapped_column(String, nullable=False)
    summary: Mapped[str] = mapped_column(Text, nullable=False)
    before: Mapped[str | None] = mapped_column(Text)
    after: Mapped[str | None] = mapped_column(Text)
    source_url: Mapped[str] = mapped_column(String, nullable=False)
    detected_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)
    claim_ids: Mapped[list[str] | None] = mapped_column(JSON)
    analysis: Mapped[AnalysisTable] = relationship(back_populates="changes")


class ReportTable(Base):
    __tablename__ = "reports"

    id: Mapped[str] = mapped_column(String, primary_key=True)
    analysis_id: Mapped[str] = mapped_column(ForeignKey("analyses.id"), nullable=False)
    generated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)
    executive_summary: Mapped[str] = mapped_column(Text, nullable=False)
    gaps: Mapped[list[dict[str, Any]]] = mapped_column(JSON, nullable=False)
    battlecards: Mapped[list[dict[str, Any]]] = mapped_column(JSON, nullable=False)
    markdown: Mapped[str] = mapped_column(Text, nullable=False)
    analysis: Mapped[AnalysisTable] = relationship(back_populates="reports")


class EventTable(Base):
    __tablename__ = "events"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    analysis_id: Mapped[str] = mapped_column(ForeignKey("analyses.id"), nullable=False)
    event_id: Mapped[int] = mapped_column(Integer, nullable=False)
    ts: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)
    agent: Mapped[str] = mapped_column(String, nullable=False)
    step: Mapped[str | None] = mapped_column(String)
    level: Mapped[str] = mapped_column(String, nullable=False)
    message: Mapped[str] = mapped_column(Text, nullable=False)
    product_id: Mapped[str | None] = mapped_column(String)
    data: Mapped[dict[str, Any]] = mapped_column(JSON, nullable=False, default=dict)
    analysis: Mapped[AnalysisTable] = relationship(back_populates="events")


class ExtractionCacheTable(Base):
    __tablename__ = "extraction_cache"

    cache_key: Mapped[str] = mapped_column(String, primary_key=True)
    content_hash: Mapped[str] = mapped_column(String, nullable=False, index=True)
    chunk_index: Mapped[int] = mapped_column(Integer, nullable=False)
    prompt_version: Mapped[str] = mapped_column(String, nullable=False)
    result: Mapped[list[dict[str, Any]]] = mapped_column(JSON, nullable=False)


class VerificationCacheTable(Base):
    __tablename__ = "verification_cache"

    cache_key: Mapped[str] = mapped_column(String, primary_key=True)
    prompt_version: Mapped[str] = mapped_column(String, nullable=False)
    result: Mapped[list[dict[str, Any]]] = mapped_column(JSON, nullable=False)


class DiffCacheTable(Base):
    __tablename__ = "diff_cache"

    cache_key: Mapped[str] = mapped_column(String, primary_key=True)
    prompt_version: Mapped[str] = mapped_column(String, nullable=False)
    summary: Mapped[str] = mapped_column(Text, nullable=False)


class ReportCacheTable(Base):
    __tablename__ = "report_cache"

    cache_key: Mapped[str] = mapped_column(String, primary_key=True)
    prompt_version: Mapped[str] = mapped_column(String, nullable=False)
    result: Mapped[dict[str, Any]] = mapped_column(JSON, nullable=False)


__all__ = [
    "AnalysisTable",
    "ProductTable",
    "SnapshotTable",
    "ClaimTable",
    "EvidenceTable",
    "ChangeTable",
    "ReportTable",
    "EventTable",
    "ExtractionCacheTable",
    "VerificationCacheTable",
    "DiffCacheTable",
    "ReportCacheTable",
]
