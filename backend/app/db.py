from collections.abc import Generator
from pathlib import Path

from sqlalchemy import create_engine, inspect, text
from sqlalchemy.orm import Session, declarative_base, sessionmaker

from app.config import settings


def _sqlite_path(database_url: str) -> Path | None:
    prefix = "sqlite:///"
    return Path(database_url[len(prefix) :]) if database_url.startswith(prefix) else None


if (sqlite_path := _sqlite_path(settings.DATABASE_URL)) is not None:
    sqlite_path.parent.mkdir(parents=True, exist_ok=True)

engine = create_engine(
    settings.DATABASE_URL,
    connect_args={"check_same_thread": False} if settings.DATABASE_URL.startswith("sqlite") else {},
)
SessionLocal = sessionmaker(bind=engine, autoflush=False, autocommit=False)
Base = declarative_base()


def get_db() -> Generator[Session, None, None]:
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()


def init_db() -> None:
    from app.models import tables  # noqa: F401

    Base.metadata.create_all(bind=engine)
    if "products" in inspect(engine).get_table_names():
        columns = {column["name"] for column in inspect(engine).get_columns("products")}
        if "extra_urls" not in columns:
            with engine.begin() as connection:
                connection.execute(text("ALTER TABLE products ADD COLUMN extra_urls JSON"))
