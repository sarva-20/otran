from fastapi import APIRouter
from pydantic import BaseModel

from app.llm.router import LLMRouter

router = APIRouter()
llm_router = LLMRouter()


class Health(BaseModel):
    status: str
    llm_provider: str
    llm_model: str


@router.get("/health", response_model=Health)
async def health() -> Health:
    return Health(
        status="ok",
        llm_provider=llm_router.active_provider,
        llm_model=llm_router.active_model,
    )
