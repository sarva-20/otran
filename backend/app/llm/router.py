import asyncio
import logging
from collections.abc import Callable
import httpx

from pydantic import BaseModel

from app.config import settings
from app.llm.gemini import GeminiClient
from app.llm.ollama import OllamaClient

logger = logging.getLogger(__name__)


class LLMRouter:
    def __init__(
        self,
        gemini: object | None = None,
        ollama: object | None = None,
        retry_attempts: int = 2,
        sleep: Callable[[float], object] = asyncio.sleep,
    ) -> None:
        self.gemini = gemini or GeminiClient(settings.GEMINI_API_KEY, settings.GEMINI_MODEL)
        self.ollama = ollama or OllamaClient(settings.OLLAMA_BASE_URL, settings.OLLAMA_MODEL)
        self._active_provider = "gemini"
        self._retry_attempts = retry_attempts
        self._sleep = sleep
        self._fallback_enabled = settings.LLM_FALLBACK

    @property
    def active_provider(self) -> str:
        return self._active_provider

    @property
    def active_model(self) -> str:
        return settings.GEMINI_MODEL if self._active_provider == "gemini" else settings.OLLAMA_MODEL

    async def generate_json(
        self,
        prompt: str,
        schema: type[BaseModel],
        system: str | None = None,
    ) -> BaseModel:
        if self._active_provider == "ollama":
            return await self.ollama.generate_json(prompt, schema, system)

        for attempt in range(self._retry_attempts + 1):
            try:
                return await self.gemini.generate_json(prompt, schema, system)
            except Exception as exc:
                if not _is_rate_limit(exc) or attempt >= self._retry_attempts:
                    if not _is_rate_limit(exc):
                        raise
                    break
                await self._sleep(0.25 * (2**attempt))

        if not self._fallback_enabled:
            raise RuntimeError("Gemini rate limit reached and LLM_FALLBACK=false")
        self._active_provider = "ollama"
        logger.warning("Gemini rate limit reached; switching to Ollama")
        return await self.ollama.generate_json(prompt, schema, system)

    def disable_fallback(self) -> None:
        self._fallback_enabled = False

    async def validate_fallback(self) -> bool:
        if not self._fallback_enabled:
            return False
        try:
            async with httpx.AsyncClient(timeout=3.0) as client:
                response = await client.get(f"{settings.OLLAMA_BASE_URL.rstrip('/')}/api/tags")
                response.raise_for_status()
            models = {item.get("name") for item in response.json().get("models", [])}
            available = settings.OLLAMA_MODEL in models
            if not available:
                self.disable_fallback()
                logger.warning("Ollama fallback disabled: model %s is not installed", settings.OLLAMA_MODEL)
            return available
        except Exception as exc:
            self.disable_fallback()
            logger.warning("Ollama fallback disabled: %s", exc)
            return False


def _is_rate_limit(error: Exception) -> bool:
    status_code = getattr(error, "status_code", None)
    text = str(error).lower()
    return status_code == 429 or "429" in text or "quota" in text or "rate limit" in text
