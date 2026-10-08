"""Database connection setup (SQLAlchemy + SQLite)."""

from sqlalchemy import create_engine, event
from sqlalchemy.orm import DeclarativeBase, sessionmaker

from app.config import DATABASE_URL

# check_same_thread=False lets FastAPI use the connection from its worker threads.
engine = create_engine(DATABASE_URL, connect_args={"check_same_thread": False})
SessionLocal = sessionmaker(bind=engine, autoflush=False)


@event.listens_for(engine, "connect")
def enable_foreign_keys(dbapi_connection, _connection_record):
    # SQLite ignores foreign keys unless this is turned on for every connection.
    dbapi_connection.execute("PRAGMA foreign_keys = ON")


class Base(DeclarativeBase):
    pass


def get_db():
    """FastAPI dependency: one database session per request, always closed afterwards."""
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()
