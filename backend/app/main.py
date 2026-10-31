import logging
import os
from pathlib import Path

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.api.system import llm_router, router as system_router
from app.api.analyses import router as analyses_router
from app.api.evidence import router as evidence_router
from app.config import settings
from app.db import SessionLocal, init_db
from app.services.cache_io import import_llm_cache

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s %(levelname)s %(name)s %(message)s",
)
logger = logging.getLogger(__name__)

app = FastAPI(title="Otran API")
app.add_middleware(
    CORSMiddleware,
    allow_origins=[origin.strip() for origin in settings.CORS_ORIGINS.split(",") if origin.strip()],
    allow_origin_regex=r"https?://(localhost|127\.0\.0\.1)(:\d+)?$",
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)
app.include_router(system_router)
app.include_router(analyses_router)
app.include_router(evidence_router)


def _setting_source(name: str, default: object) -> tuple[object, str]:
    if name in os.environ:
        return os.environ[name], "shell env"
    for path in (Path(".env"), Path("backend/.env")):
        if path.exists():
            for line in path.read_text().splitlines():
                if line.startswith(f"{name}="):
                    return line.split("=", 1)[1], str(path)
    return default, "default"


def _log_effective_settings() -> None:
    values = {
        "OFFLINE_DEMO": settings.OFFLINE_DEMO,
        "OLLAMA_BASE_URL": settings.OLLAMA_BASE_URL,
        "OLLAMA_MODEL": settings.OLLAMA_MODEL,
        "LLM_FALLBACK": settings.LLM_FALLBACK,
    }
    defaults = {
        "OFFLINE_DEMO": False,
        "OLLAMA_BASE_URL": "http://127.0.0.1:11434",
        "OLLAMA_MODEL": "qwen2.5:7b-instruct",
        "LLM_FALLBACK": True,
    }
    for name, value in values.items():
        _, source = _setting_source(name, defaults[name])
        logger.info("setting %s=%s source=%s", name, value, source)
        if source == "shell env" and Path("backend/.env").exists():
            logger.warning("shell environment overrides .env for %s", name)
    logger.info(
        "setting LLM_PROVIDER=%s LLM_MODEL=%s source=active router",
        llm_router.active_provider,
        llm_router.active_model,
    )


@app.on_event("startup")
async def startup() -> None:
    _log_effective_settings()
    await llm_router.validate_fallback()
    init_db()
    if settings.OFFLINE_DEMO:
        with SessionLocal() as db:
            import_llm_cache(db, Path(__file__).parents[1] / "data" / "seed" / "llm_cache.json")
