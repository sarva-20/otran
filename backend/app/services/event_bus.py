import asyncio
from collections import defaultdict
from collections.abc import AsyncGenerator
from datetime import datetime, timezone
from enum import Enum
from typing import Any, Literal

from pydantic import BaseModel, ConfigDict, Field


class AgentName(str, Enum):
    orchestrator = "orchestrator"
    discovery = "discovery"
    collector = "collector"
    extractor = "extractor"
    verifier = "verifier"
    diff = "diff"
    analyst = "analyst"
    qa = "qa"


class AgentEvent(BaseModel):
    model_config = ConfigDict(extra="forbid")

    id: int
    ts: datetime
    agent: AgentName
    step: str = ""
    level: Literal["info", "success", "warning", "error"]
    message: str
    product_id: str | None = None
    data: dict[str, Any] = Field(default_factory=dict)


class EventBus:
    def __init__(self) -> None:
        self._history: dict[str, list[AgentEvent]] = defaultdict(list)
        self._subscribers: dict[str, list[asyncio.Queue[AgentEvent]]] = defaultdict(list)
        self._next_id: dict[str, int] = defaultdict(int)

    def publish(self, analysis_id: str, event: AgentEvent) -> None:
        self._next_id[analysis_id] += 1
        if event.id != self._next_id[analysis_id]:
            event = event.model_copy(update={"id": self._next_id[analysis_id]})
        self._history[analysis_id].append(event)
        for queue in self._subscribers[analysis_id]:
            queue.put_nowait(event)

    async def subscribe(self, analysis_id: str) -> AsyncGenerator[AgentEvent, None]:
        queue: asyncio.Queue[AgentEvent] = asyncio.Queue()
        self._subscribers[analysis_id].append(queue)
        try:
            for event in self._history[analysis_id]:
                yield event
            while True:
                yield await queue.get()
        finally:
            self._subscribers[analysis_id].remove(queue)


event_bus = EventBus()


def utc_now() -> datetime:
    return datetime.now(timezone.utc)
