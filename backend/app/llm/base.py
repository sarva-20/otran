from typing import Protocol

from pydantic import BaseModel


class LLMClient(Protocol):
    async def generate_json(
        self,
        prompt: str,
        schema: type[BaseModel],
        system: str | None = None,
    ) -> BaseModel:
        ...
