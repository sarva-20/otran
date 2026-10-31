from fastapi import APIRouter, HTTPException
from sqlalchemy.orm import Session, joinedload
from fastapi import Depends

from app.db import get_db
from app.models.schemas import Claim, Evidence, Snapshot, Verification
from app.models.tables import ClaimTable, SnapshotTable

router = APIRouter()


@router.get("/api/claims/{claim_id}", response_model=Claim)
def get_claim(claim_id: str, db: Session = Depends(get_db)) -> Claim:
    row = db.query(ClaimTable).options(joinedload(ClaimTable.evidence)).filter_by(id=claim_id).first()
    if row is None:
        raise HTTPException(status_code=404, detail="Claim not found")
    return Claim(
        id=row.id,
        product_id=row.product_id,
        dimension=row.dimension,
        statement=row.statement,
        data=row.data,
        evidence=[Evidence.model_validate(evidence, from_attributes=True) for evidence in row.evidence],
        verification=Verification.model_validate(row.verification),
        first_seen_at=row.first_seen_at,
        last_seen_at=row.last_seen_at,
    )


@router.get("/api/snapshots/{snapshot_id}", response_model=Snapshot)
def get_snapshot(snapshot_id: str, db: Session = Depends(get_db)) -> Snapshot:
    row = db.get(SnapshotTable, snapshot_id)
    if row is None:
        raise HTTPException(status_code=404, detail="Snapshot not found")
    return Snapshot.model_validate(row, from_attributes=True)
