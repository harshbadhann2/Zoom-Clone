"""Sign up / log in / log out, and the dependencies that read the logged-in user.

How it works:
- Passwords are hashed with PBKDF2 (Python standard library) and a random salt.
- Logging in creates a random token stored in the `sessions` table.
- The browser sends it back on every request as `Authorization: Bearer <token>`.
"""

import hashlib
import hmac
import secrets

from fastapi import APIRouter, Depends, HTTPException, Response
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.database import get_db
from app.models import AuthSession, User
from app.schemas import AuthResponse, LoginRequest, ProfileUpdate, SignupRequest, UserOut

HASH_ITERATIONS = 200_000

router = APIRouter(prefix="/api/auth", tags=["auth"])
bearer = HTTPBearer(auto_error=False)


# ---------- Passwords ----------

def hash_password(password: str) -> str:
    salt = secrets.token_hex(16)
    digest = hashlib.pbkdf2_hmac("sha256", password.encode(), salt.encode(), HASH_ITERATIONS).hex()
    return f"{salt}${digest}"


def verify_password(password: str, stored: str) -> bool:
    salt, expected = stored.split("$")
    digest = hashlib.pbkdf2_hmac("sha256", password.encode(), salt.encode(), HASH_ITERATIONS).hex()
    return hmac.compare_digest(digest, expected)  # constant-time comparison


def start_session(db: Session, user: User) -> AuthResponse:
    session = AuthSession(token=secrets.token_urlsafe(32), user=user)
    db.add(session)
    db.commit()
    return AuthResponse(token=session.token, user=UserOut.model_validate(user))


# ---------- Dependencies used by other routes ----------

def get_optional_user(
    credentials: HTTPAuthorizationCredentials | None = Depends(bearer), db: Session = Depends(get_db)
) -> User | None:
    """The logged-in user, or None for guests (e.g. someone joining from an invite link)."""
    if credentials is None:
        return None
    session = db.get(AuthSession, credentials.credentials)
    return session.user if session else None


def get_current_user(user: User | None = Depends(get_optional_user)) -> User:
    if user is None:
        raise HTTPException(status_code=401, detail="Please sign in to continue.")
    return user


# ---------- Routes ----------

@router.post("/signup", response_model=AuthResponse, status_code=201)
def signup(data: SignupRequest, db: Session = Depends(get_db)):
    if db.scalar(select(User.id).where(User.email == data.email)) is not None:
        raise HTTPException(status_code=409, detail="An account with this email already exists.")
    user = User(name=data.name, email=data.email, password_hash=hash_password(data.password))
    db.add(user)
    db.commit()
    return start_session(db, user)


@router.post("/login", response_model=AuthResponse)
def login(data: LoginRequest, db: Session = Depends(get_db)):
    user = db.scalar(select(User).where(User.email == data.email))
    if user is None or not verify_password(data.password, user.password_hash):
        raise HTTPException(status_code=401, detail="Incorrect email or password.")
    return start_session(db, user)


@router.get("/me", response_model=UserOut)
def me(user: User = Depends(get_current_user)):
    return user


@router.patch("/me", response_model=UserOut)
def update_profile(data: ProfileUpdate, user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    """Change your own display name. Only the signed-in user's row can be changed."""
    user.name = data.name
    db.commit()
    return user


@router.post("/logout", status_code=204)
def logout(credentials: HTTPAuthorizationCredentials | None = Depends(bearer), db: Session = Depends(get_db)):
    if credentials and (session := db.get(AuthSession, credentials.credentials)):
        db.delete(session)
        db.commit()
    return Response(status_code=204)
