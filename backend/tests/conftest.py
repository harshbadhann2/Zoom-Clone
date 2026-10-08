import pytest
from fastapi.testclient import TestClient
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
from sqlalchemy.pool import StaticPool

from app.database import Base, get_db
from app.main import app


@pytest.fixture
def db_session_factory():
    """A fresh in-memory SQLite database for every test."""
    engine = create_engine("sqlite://", connect_args={"check_same_thread": False}, poolclass=StaticPool)
    Base.metadata.create_all(engine)
    return sessionmaker(bind=engine, autoflush=False)


@pytest.fixture
def client(db_session_factory):
    def override_get_db():
        db = db_session_factory()
        try:
            yield db
        finally:
            db.close()

    app.dependency_overrides[get_db] = override_get_db
    # Not using `with TestClient(...)`, so the startup seeding doesn't touch the real database.
    yield TestClient(app)
    app.dependency_overrides.clear()


@pytest.fixture
def auth_headers(client):
    """Sign up a fresh user and return the header that proves who they are."""
    response = client.post(
        "/api/auth/signup", json={"name": "Harsh Badhan", "email": "harsh@example.com", "password": "secret123"}
    )
    return {"Authorization": f"Bearer {response.json()['token']}"}
