import json
from typing import Any

from google import genai
from pydantic import BaseModel


class GeminiClient:
    def __init__(self, api_key: str, model: str) -> None:
        self.model = model
        self._api_key = api_key
        self._client: genai.Client | None = None

    async def generate_json(
        self,
        prompt: str,
        schema: type[BaseModel],
        system: str | None = None,
    ) -> BaseModel:
        if self._client is None:
            self._client = genai.Client(api_key=self._api_key)
        config: dict[str, Any] = {
            "response_mime_type": "application/json",
            "response_schema": schema.model_json_schema(),
        }
        if system:
            config["system_instruction"] = system
        response = await self._client.aio.models.generate_content(
            model=self.model,
            contents=prompt,
            config=config,
        )
        return schema.model_validate(json.loads(response.text))
