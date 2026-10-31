import json
from pathlib import Path
from typing import Any

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.models.tables import (
    DiffCacheTable,
    ExtractionCacheTable,
    QACacheTable,
    ReportCacheTable,
    VerificationCacheTable,
)

CACHE_TABLES = {
    "extraction": ExtractionCacheTable,
    "verification": VerificationCacheTable,
    "diff": DiffCacheTable,
    "report": ReportCacheTable,
    "qa": QACacheTable,
}


def export_llm_cache(db: Session, path: Path) -> None:
    payload: dict[str, list[dict[str, Any]]] = {}
    for name, table in CACHE_TABLES.items():
        payload[name] = [
            {column.name: getattr(row, column.name) for column in table.__table__.columns}
            for row in db.scalars(select(table))
        ]
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(payload, indent=2, default=str) + "\n")


def import_llm_cache(db: Session, path: Path) -> None:
    if not path.exists():
        return
    payload = json.loads(path.read_text())
    for name, table in CACHE_TABLES.items():
        for row in payload.get(name, []):
            db.merge(table(**row))
    db.commit()
