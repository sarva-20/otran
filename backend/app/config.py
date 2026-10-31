from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    GEMINI_API_KEY: str = ""
    GEMINI_MODEL: str = "gemini-2.5-flash"
    OLLAMA_BASE_URL: str = "http://127.0.0.1:11434"
    OLLAMA_MODEL: str = "qwen2.5:7b-instruct"
    DATABASE_URL: str = "sqlite:///backend/data/otran.db"
    OFFLINE_DEMO: bool = False
    CORS_ORIGINS: str = "http://localhost:5173,http://127.0.0.1:5173"
    ORCHESTRATOR: str = "graph"
    LLM_FALLBACK: bool = True

    model_config = SettingsConfigDict(env_file=".env", extra="ignore")


settings = Settings()
