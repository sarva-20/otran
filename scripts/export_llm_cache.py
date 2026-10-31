from pathlib import Path

from app.db import SessionLocal, init_db
from app.services.cache_io import export_llm_cache


def main() -> None:
    init_db()
    with SessionLocal() as db:
        export_llm_cache(db, Path("backend/data/seed/llm_cache.json"))


if __name__ == "__main__":
    main()
