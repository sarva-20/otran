from datetime import datetime, timezone

import pytest
from pydantic import BaseModel
from sqlalchemy import create_engine, func, select
from sqlalchemy.orm import Session
from sqlalchemy.pool import StaticPool

from app.agents.diff import DiffAgent
from app.db import Base
from app.models.schemas import Analysis, Claim, Evidence, Product, Snapshot, Verification
from app.models.tables import ChangeTable
from app.services.repository import create_analysis, save_claim_with_evidence, save_snapshot


@pytest.fixture
def db() -> Session:
    engine = create_engine("sqlite://", connect_args={"check_same_thread": False}, poolclass=StaticPool)
    Base.metadata.create_all(engine)
    with Session(engine) as session:
        yield session


def analysis() -> Analysis:
    return Analysis(
        id="an_d",
        status="running",
        created_at=datetime.now(timezone.utc),
        products=[Product(id="p_d", name="Acme", role="ours", url="https://acme.example")],
        dimensions=["pricing", "features"],
    )


def snapshot(snapshot_id: str, url: str, text: str, source_type: str = "pricing") -> Snapshot:
    return Snapshot(
        id=snapshot_id,
        url=url,
        source_type=source_type,
        captured_at=datetime.now(timezone.utc),
        content_hash=snapshot_id,
        text=text,
    )


def claim(
    db: Session,
    snapshot_id: str,
    claim_id: str,
    statement: str,
    quote: str,
    dimension: str = "pricing",
    data: dict | None = None,
) -> None:
    save_claim_with_evidence(
        db,
        "an_d",
        Claim(
            id=claim_id,
            product_id="p_d",
            dimension=dimension,
            statement=statement,
            data=data,
            evidence=[
                Evidence(
                    id=f"e_{claim_id}",
                    quote=quote,
                    source_url="https://acme.example/pricing",
                    source_type="pricing",
                    snapshot_id=snapshot_id,
                    captured_at=datetime.now(timezone.utc),
                )
            ],
            verification=Verification(status="verified", confidence=1),
        ),
    )


class FailingLLM:
    async def generate_json(self, prompt: str, schema: type[BaseModel], system: str | None = None):
        raise RuntimeError("offline")


@pytest.mark.asyncio
async def test_price_change_is_modified_high_and_unchanged_is_skipped(db: Session) -> None:
    create_analysis(db, analysis())
    old_same = snapshot("old-same", "https://acme.example/docs", "same")
    new_same = snapshot("new-same", old_same.url, "same")
    old = snapshot("old-price", "https://acme.example/pricing", "Pro $8")
    new = snapshot("new-price", old.url, "Pro $10")
    for item in [old_same, new_same, old, new]:
        save_snapshot(db, item)
    claim(db, old.id, "c_old", "Pro costs $8", "Pro $8", data={"tier": "Pro", "price": 8})
    claim(db, new.id, "c_new", "Pro costs $10", "Pro $10", data={"tier": "Pro", "price": 10})
    changes = await DiffAgent(db, FailingLLM()).diff("an_d", [old_same, old], [new_same, new])
    assert len(changes) == 1
    assert changes[0].change_type == "modified"
    assert changes[0].severity == "high"
    assert changes[0].before == "Pro $8"
    assert changes[0].after == "Pro $10"


@pytest.mark.asyncio
async def test_release_added_and_plan_removed(db: Session) -> None:
    create_analysis(db, analysis())
    old = snapshot("old", "https://acme.example/changelog", "old", "release_notes")
    new = snapshot("new", old.url, "new", "release_notes")
    old_plan = snapshot("old-plan", "https://acme.example/plans", "old", "pricing")
    new_plan = snapshot("new-plan", old_plan.url, "new", "pricing")
    for item in [old, new, old_plan, new_plan]:
        save_snapshot(db, item)
    claim(db, old.id, "c_release_old", "Version 1.0", "Version 1.0", "features", {"version": "1.0"})
    claim(db, new.id, "c_release_new", "Version 1.1", "Version 1.1", "features", {"version": "1.1"})
    claim(db, old_plan.id, "c_plan_old", "Basic plan", "Basic plan", data={"tier": "Basic", "price": 5})
    changes = await DiffAgent(db, FailingLLM()).diff(
        "an_d", [old, old_plan], [new, new_plan]
    )
    assert any(item.change_type == "added" and item.severity == "medium" for item in changes)
    assert any(item.change_type == "removed" and item.severity == "high" for item in changes)


@pytest.mark.asyncio
async def test_diff_is_idempotent_and_template_fallback(db: Session) -> None:
    create_analysis(db, analysis())
    old = snapshot("old", "https://acme.example/pricing", "old")
    new = snapshot("new", old.url, "new")
    save_snapshot(db, old)
    save_snapshot(db, new)
    claim(db, old.id, "c_old", "Old", "Old", data={"tier": "Pro", "price": 8})
    claim(db, new.id, "c_new", "New", "New", data={"tier": "Pro", "price": 9})
    agent = DiffAgent(db, FailingLLM())
    first = await agent.diff("an_d", [old], [new])
    second = await agent.diff("an_d", [old], [new])
    assert first[0].summary.startswith("Claim changed")
    assert second[0].id == first[0].id
    assert db.scalar(select(func.count()).select_from(ChangeTable)) == 1
