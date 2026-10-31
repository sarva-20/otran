from sqlalchemy import select
from sqlalchemy.orm import Session

from app.models.schemas import Analysis, Change, Claim, Report, Snapshot
from app.models.tables import (
    AnalysisTable,
    ChangeTable,
    ClaimTable,
    EvidenceTable,
    ExtractionCacheTable,
    ProductTable,
    SnapshotTable,
    VerificationCacheTable,
    DiffCacheTable,
    ReportCacheTable,
    ReportTable,
)


def create_analysis(db: Session, analysis: Analysis) -> AnalysisTable:
    row = AnalysisTable(
        id=analysis.id,
        status=analysis.status,
        run_number=analysis.run_number,
        created_at=analysis.created_at,
        completed_at=analysis.completed_at,
        dimensions=analysis.dimensions,
        stats=analysis.stats.model_dump() if analysis.stats else None,
        products=[
            ProductTable(id=product.id, name=product.name, role=product.role, url=product.url)
            for product in analysis.products
        ],
    )
    db.add(row)
    db.commit()
    db.refresh(row)
    return row


def save_snapshot(db: Session, snapshot: Snapshot) -> SnapshotTable:
    row = SnapshotTable(**snapshot.model_dump())
    db.add(row)
    db.commit()
    db.refresh(row)
    return row


def latest_snapshot_for_url(db: Session, url: str) -> SnapshotTable | None:
    return db.scalar(
        select(SnapshotTable)
        .where(SnapshotTable.url == url)
        .order_by(SnapshotTable.captured_at.desc())
        .limit(1)
    )


def save_claim_with_evidence(
    db: Session,
    analysis_id: str,
    claim: Claim,
) -> ClaimTable:
    if not claim.evidence:
        raise ValueError("A claim requires at least one evidence row")
    row = ClaimTable(
        id=claim.id,
        analysis_id=analysis_id,
        product_id=claim.product_id,
        dimension=claim.dimension,
        statement=claim.statement,
        data=claim.data,
        verification=claim.verification.model_dump(),
        first_seen_at=claim.first_seen_at,
        last_seen_at=claim.last_seen_at,
        evidence=[EvidenceTable(claim_id=claim.id, **evidence.model_dump()) for evidence in claim.evidence],
    )
    db.add(row)
    db.commit()
    db.refresh(row)
    return row


def list_claims(db: Session, analysis_id: str, product_id: str | None = None) -> list[ClaimTable]:
    statement = select(ClaimTable).where(ClaimTable.analysis_id == analysis_id)
    if product_id is not None:
        statement = statement.where(ClaimTable.product_id == product_id)
    return list(db.scalars(statement.order_by(ClaimTable.id)))


def save_change(db: Session, analysis_id: str, change: Change) -> ChangeTable:
    row = ChangeTable(analysis_id=analysis_id, **change.model_dump())
    db.add(row)
    db.commit()
    db.refresh(row)
    return row


def get_matrix_inputs(
    db: Session,
    analysis_id: str,
) -> list[tuple[ClaimTable, list[EvidenceTable]]]:
    claims = db.scalars(
        select(ClaimTable).where(ClaimTable.analysis_id == analysis_id).order_by(ClaimTable.id)
    ).all()
    return [(claim, list(claim.evidence)) for claim in claims]


def get_extraction_cache(
    db: Session,
    content_hash: str,
    chunk_index: int,
    prompt_version: str,
) -> list[dict[str, object]] | None:
    key = f"{content_hash}:{chunk_index}:{prompt_version}"
    row = db.get(ExtractionCacheTable, key)
    return row.result if row is not None else None


def save_extraction_cache(
    db: Session,
    content_hash: str,
    chunk_index: int,
    prompt_version: str,
    result: list[dict[str, object]],
) -> None:
    key = f"{content_hash}:{chunk_index}:{prompt_version}"
    db.merge(
        ExtractionCacheTable(
            cache_key=key,
            content_hash=content_hash,
            chunk_index=chunk_index,
            prompt_version=prompt_version,
            result=result,
        )
    )
    db.commit()


def get_verification_cache(
    db: Session,
    cache_key: str,
    prompt_version: str,
) -> list[dict[str, object]] | None:
    row = db.get(VerificationCacheTable, f"{prompt_version}:{cache_key}")
    return row.result if row is not None else None


def save_verification_cache(
    db: Session,
    cache_key: str,
    prompt_version: str,
    result: list[dict[str, object]],
) -> None:
    db.merge(
        VerificationCacheTable(
            cache_key=f"{prompt_version}:{cache_key}",
            prompt_version=prompt_version,
            result=result,
        )
    )
    db.commit()


def update_claim_verification(
    db: Session,
    claim: ClaimTable,
    verification: dict[str, object],
) -> None:
    claim.verification = verification
    db.add(claim)
    db.commit()


def get_diff_cache(db: Session, cache_key: str, prompt_version: str) -> str | None:
    row = db.get(DiffCacheTable, f"{prompt_version}:{cache_key}")
    return row.summary if row is not None else None


def save_diff_cache(db: Session, cache_key: str, prompt_version: str, summary: str) -> None:
    db.merge(
        DiffCacheTable(
            cache_key=f"{prompt_version}:{cache_key}",
            prompt_version=prompt_version,
            summary=summary,
        )
    )
    db.commit()


def get_report_cache(
    db: Session,
    cache_key: str,
    prompt_version: str,
) -> dict[str, object] | None:
    row = db.get(ReportCacheTable, f"{prompt_version}:{cache_key}")
    return row.result if row is not None else None


def save_report_cache(
    db: Session,
    cache_key: str,
    prompt_version: str,
    result: dict[str, object],
) -> None:
    db.merge(
        ReportCacheTable(
            cache_key=f"{prompt_version}:{cache_key}",
            prompt_version=prompt_version,
            result=result,
        )
    )
    db.commit()


def replace_report(db: Session, analysis_id: str, report: Report) -> ReportTable:
    db.query(ReportTable).filter(ReportTable.analysis_id == analysis_id).delete()
    row = ReportTable(
        id=f"report_{report.analysis_id}",
        analysis_id=analysis_id,
        generated_at=report.generated_at,
        executive_summary=report.executive_summary,
        gaps=[gap.model_dump() for gap in report.gaps],
        battlecards=[battlecard.model_dump() for battlecard in report.battlecards],
        markdown=report.markdown,
    )
    db.add(row)
    db.commit()
    db.refresh(row)
    return row
