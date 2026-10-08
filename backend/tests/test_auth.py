from app.auth import hash_password, verify_password

USER = {"name": "Priya Sharma", "email": "Priya@Example.com", "password": "secret123"}


def bearer(token: str) -> dict:
    return {"Authorization": f"Bearer {token}"}


def test_passwords_are_hashed_with_a_salt():
    first, second = hash_password("secret123"), hash_password("secret123")
    assert "secret123" not in first
    assert first != second  # different random salt each time
    assert verify_password("secret123", first)
    assert not verify_password("wrong-password", first)


def test_signup_then_me(client):
    response = client.post("/api/auth/signup", json=USER)
    assert response.status_code == 201
    body = response.json()
    assert body["user"]["email"] == "priya@example.com"  # stored lowercase

    me = client.get("/api/auth/me", headers=bearer(body["token"]))
    assert me.status_code == 200
    assert me.json()["name"] == "Priya Sharma"


def test_signup_validation(client):
    assert client.post("/api/auth/signup", json={**USER, "password": "short"}).status_code == 422
    bad_email = client.post("/api/auth/signup", json={**USER, "email": "not-an-email"})
    assert bad_email.status_code == 422
    assert bad_email.json()["detail"] == "Email: Enter a valid email address"


def test_duplicate_email_is_rejected(client):
    client.post("/api/auth/signup", json=USER)
    assert client.post("/api/auth/signup", json={**USER, "email": "priya@example.com"}).status_code == 409


def test_login_success_and_wrong_password(client):
    client.post("/api/auth/signup", json=USER)

    assert client.post("/api/auth/login", json={"email": "priya@example.com", "password": "secret123"}).status_code == 200
    wrong = client.post("/api/auth/login", json={"email": "priya@example.com", "password": "nope"})
    assert wrong.status_code == 401
    assert wrong.json()["detail"] == "Incorrect email or password."


def test_logout_invalidates_the_token(client):
    token = client.post("/api/auth/signup", json=USER).json()["token"]

    assert client.post("/api/auth/logout", headers=bearer(token)).status_code == 204
    assert client.get("/api/auth/me", headers=bearer(token)).status_code == 401


def test_protected_routes_need_a_valid_token(client):
    assert client.get("/api/meetings/upcoming").status_code == 401
    assert client.get("/api/meetings/upcoming", headers=bearer("made-up-token")).status_code == 401
