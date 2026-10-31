import asyncio
import logging
import operator
from datetime import datetime, timezone
from typing import Annotated, Any, TypedDict

from langgraph.graph import END, START, StateGraph
from langgraph.types import Send
from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app.agents.analyst import Analyst
from app.agents.collector import Collector
from app.agents.discovery import Discovery, offline_discover
from app.agents.diff import DiffAgent
from app.agents.extractor import Extractor
from app.agents.verifier import Verifier
from app.collectors.fetcher import Fetcher
from app.config import settings
from app.llm.router import LLMRouter
from app.models.schemas import Snapshot
from app.models.tables import AnalysisTable, ClaimTable, EventTable, ProductTable, SnapshotTable
from app.services.event_bus import AgentEvent, EventBus, event_bus

logger = logging.getLogger(__name__)


class GraphState(TypedDict, total=False):
    analysis_id: str
    run_number: int
    product_ids: list[str]
    product_id: str
    progress: Annotated[list[dict[str, Any]], operator.add]
    snapshots: Annotated[list[Snapshot], operator.add]
    retries: Annotated[dict[str, int], operator.or_]
    errors: Annotated[list[str], operator.add]
    previous_snapshots: dict[str, Snapshot]
    changes: list[Any]
    status: str


class GraphOrchestrator:
    def __init__(
        self,
        db: Session,
        fetcher: Fetcher | None = None,
        llm: LLMRouter | object | None = None,
        bus: EventBus | None = None,
    ) -> None:
        self.db = db
        self.fetcher = fetcher or Fetcher()
        self.llm = llm if llm is not None else (None if settings.OFFLINE_DEMO else LLMRouter())
        self.bus = bus or event_bus
        self._event_id = 0
        self._semaphore = asyncio.Semaphore(2)

    def build_graph(self):
        graph = StateGraph(GraphState)
        graph.add_node("plan", self.plan)
        graph.add_node("product", self.product)
        graph.add_node("join", self.join)
        graph.add_node("verifier", self.verifier)
        graph.add_node("resolver", self.resolver)
        graph.add_node("diff_gate", self.diff_gate)
        graph.add_node("diff", self.diff)
        graph.add_node("analyst", self.analyst)
        graph.add_node("finalize", self.finalize)
        graph.add_edge(START, "plan")
        graph.add_conditional_edges("plan", self.fan_out, ["product"])
        graph.add_edge("product", "join")
        graph.add_edge("join", "verifier")
        graph.add_conditional_edges("verifier", self.route_resolver, ["resolver", "diff_gate"])
        graph.add_edge("resolver", "diff_gate")
        graph.add_conditional_edges("diff_gate", self.route_diff, ["diff", "analyst"])
        graph.add_edge("analyst", "finalize")
        graph.add_edge("finalize", END)
        return graph.compile()

    async def run(self, analysis_id: str, rerun: bool = False) -> None:
        analysis = self.db.get(AnalysisTable, analysis_id)
        if analysis is None:
            return
        previous = self._latest_snapshots() if rerun else {}
        result = await self.build_graph().ainvoke(
            {
                "analysis_id": analysis_id,
                "run_number": (analysis.run_number or 1) + int(rerun),
                "product_ids": [product.id for product in analysis.products],
                "progress": [],
                "snapshots": [],
                "retries": {},
                "errors": [],
                "previous_snapshots": previous,
                "changes": [],
                "status": "queued",
                "rerun": rerun,
            }
        )
        if result.get("status") != "completed":
            raise RuntimeError("Graph orchestration did not complete")

    def plan(self, state: GraphState) -> dict[str, Any]:
        analysis = self.db.get(AnalysisTable, state["analysis_id"])
        if analysis is None:
            raise ValueError(f"Analysis not found: {state['analysis_id']}")
        analysis.status = "running"
        analysis.run_number = state["run_number"]
        self.db.commit()
        self._emit(state, "info", "Graph plan created", {"products": len(state["product_ids"])})
        return {"status": "running"}

    def fan_out(self, state: GraphState) -> list[Send]:
        return [Send("product", {"product_id": product_id, **state}) for product_id in state["product_ids"]]

    async def product(self, state: GraphState) -> dict[str, Any]:
        async with self._semaphore:
            analysis = self.db.get(AnalysisTable, state["analysis_id"])
            product = self.db.scalar(
                select(ProductTable).where(
                    ProductTable.id == state["product_id"],
                    ProductTable.analysis_id == state["analysis_id"],
                )
            )
            if analysis is None or product is None:
                return {"errors": [f"Unknown product {state['product_id']}"]}
            try:
                if settings.OFFLINE_DEMO:
                    discovered = offline_discover(
                        product.url,
                        product.extra_urls,
                        Collector(self.db).seed_root,
                    )
                else:
                    discovered = await Discovery(self.fetcher).discover(product.url, product.extra_urls)
                    if not any(discovered.get(kind) for kind in ("pricing", "docs", "release_notes")):
                        self._emit(
                            state,
                            "warning",
                            f"No sources found for {product.name}, retrying discovery with broader search",
                            {"product_id": product.id, "reason": "broader discovery"},
                        )
                        discovered = await Discovery(self.fetcher).discover(
                            product.url,
                            [*product.extra_urls, f"{product.url.rstrip('/')}/sitemap.xml", f"{product.url.rstrip('/')}/docs"],
                        )
                snapshots = await Collector(self.db, self.fetcher, self.bus).collect(
                    state["analysis_id"], discovered, run_number=state["run_number"]
                )
                for snapshot in snapshots:
                    await Extractor(self.db, self.llm, self.bus).extract(
                        state["analysis_id"], product.id, snapshot, analysis.dimensions
                    )
                claims_after = self._claim_counts(state["analysis_id"], product.id)
                missing = [dimension for dimension in analysis.dimensions if claims_after.get(dimension, 0) == 0]
                retries: dict[str, int] = {}
                if missing and not state.get("retries", {}).get(f"extract:{product.id}", 0):
                    retries[f"extract:{product.id}"] = 1
                    self._emit(
                        state,
                        "warning",
                        f"Missing dimensions for {product.name}, retrying extraction",
                        {"product_id": product.id, "dimensions": missing, "reason": "empty dimension"},
                    )
                    for snapshot in snapshots:
                        await Extractor(self.db, self.llm, self.bus).extract(
                            state["analysis_id"], product.id, snapshot, analysis.dimensions, chunk_size=3000
                        )
                return {
                    "snapshots": snapshots,
                    "progress": [{"product_id": product.id, "status": "completed", "missing": missing}],
                    "retries": retries,
                }
            except Exception as exc:
                logger.exception("Graph product failed: %s", product.name)
                return {"errors": [f"{product.name}: {exc}"], "progress": [{"product_id": product.id, "status": "failed"}]}

    def join(self, state: GraphState) -> dict[str, Any]:
        self._emit(state, "info", "Product fan-out joined", {"products": len(state.get("progress", []))})
        return {}

    async def verifier(self, state: GraphState) -> dict[str, Any]:
        await Verifier(self.db, self.llm, self.bus).verify(state["analysis_id"])
        return {}

    def route_resolver(self, state: GraphState) -> str:
        contradiction = self.db.scalar(
            select(ClaimTable.id).where(
                ClaimTable.analysis_id == state["analysis_id"],
                ClaimTable.verification["status"].as_string() == "contradicted",
            )
        )
        if contradiction and not state.get("retries", {}).get("resolver", 0):
            self._emit(state, "warning", "Contradictions found, running resolver", {"reason": "contradictions"})
            return "resolver"
        return "diff_gate"

    async def resolver(self, state: GraphState) -> dict[str, Any]:
        await Verifier(self.db, self.llm, self.bus).verify(state["analysis_id"])
        return {"retries": {"resolver": 1}}

    def route_diff(self, state: GraphState) -> str:
        return "diff" if state["run_number"] > 1 else "analyst"

    def diff_gate(self, state: GraphState) -> dict[str, Any]:
        return {}

    async def diff(self, state: GraphState) -> dict[str, Any]:
        if state["run_number"] <= 1:
            return {}
        current = [snapshot for snapshot in state.get("snapshots", [])]
        changes = await DiffAgent(self.db, self.llm, self.bus).diff(
            state["analysis_id"], list(state.get("previous_snapshots", {}).values()), current
        )
        return {"changes": changes}

    async def analyst(self, state: GraphState) -> dict[str, Any]:
        await Analyst(self.db, self.llm, self.bus).build_report(state["analysis_id"])
        return {}

    def finalize(self, state: GraphState) -> dict[str, Any]:
        analysis = self.db.get(AnalysisTable, state["analysis_id"])
        if analysis is None:
            raise ValueError(f"Analysis not found: {state['analysis_id']}")
        claims = list(self.db.scalars(select(ClaimTable).where(ClaimTable.analysis_id == analysis.id)))
        usable = bool(state.get("snapshots") or claims)
        analysis.status = "completed" if usable else "failed"
        analysis.completed_at = datetime.now(timezone.utc)
        changes = state.get("changes", [])
        analysis.stats = {
            "sources_collected": len(state.get("snapshots", [])),
            "claims_total": len(claims),
            "claims_verified": sum(c.verification.get("status") == "verified" for c in claims),
            "claims_contradicted": sum(c.verification.get("status") == "contradicted" for c in claims),
            "changes_detected": len(changes),
        }
        self.db.commit()
        self._emit(state, "success" if usable else "error", "Graph analysis completed", {"changes_detected": len(changes)})
        self._emit(state, "success" if usable else "error", "done", {"status": analysis.status})
        self._persist_events(state["analysis_id"])
        return {"status": analysis.status}

    def _claim_counts(self, analysis_id: str, product_id: str) -> dict[str, int]:
        return {
            dimension: count
            for dimension, count in self.db.execute(
                select(ClaimTable.dimension, func.count(ClaimTable.id))
                .where(ClaimTable.analysis_id == analysis_id, ClaimTable.product_id == product_id)
                .group_by(ClaimTable.dimension)
            )
        }

    def _latest_snapshots(self) -> dict[str, Snapshot]:
        result: dict[str, Snapshot] = {}
        for row in self.db.scalars(select(SnapshotTable).order_by(SnapshotTable.captured_at)):
            result[row.url] = Snapshot.model_validate(row, from_attributes=True)
        return result

    def _emit(self, state: GraphState, level: str, message: str, data: dict[str, Any]) -> None:
        self._event_id += 1
        self.bus.publish(
            state["analysis_id"],
            AgentEvent(
                id=self._event_id,
                ts=datetime.now(timezone.utc),
                agent="orchestrator",
                step="graph",
                level=level,
                message=message,
                data=data,
            ),
        )

    def _persist_events(self, analysis_id: str) -> None:
        existing = {(row.ts, row.agent, row.message, row.level) for row in self.db.scalars(select(EventTable).where(EventTable.analysis_id == analysis_id))}
        for event in self.bus._history.get(analysis_id, []):
            key = (event.ts, event.agent, event.message, event.level)
            if key not in existing:
                self.db.add(EventTable(analysis_id=analysis_id, event_id=event.id, ts=event.ts, agent=event.agent, step=event.step, level=event.level, message=event.message, product_id=event.product_id, data=event.data))
        self.db.commit()


async def run_graph(
    db: Session,
    analysis_id: str,
    rerun: bool = False,
    fetcher: Fetcher | None = None,
    llm: LLMRouter | object | None = None,
    bus: EventBus | None = None,
) -> None:
    await GraphOrchestrator(db, fetcher, llm, bus).run(analysis_id, rerun)
