"""Pydantic schemas: the shape of request bodies (validated) and responses."""

from datetime import datetime, timedelta, timezone
from typing import Annotated, Literal

from pydantic import AfterValidator, BaseModel, ConfigDict, Field, computed_field, field_validator, model_validator

from app.config import FRONTEND_URL
from app.models import utc_now


def as_utc(value: datetime) -> datetime:
    """Database datetimes are naive UTC; tag them so JSON gets a 'Z' suffix."""
    return value.replace(tzinfo=timezone.utc) if value.tzinfo is None else value


UTCDateTime = Annotated[datetime, AfterValidator(as_utc)]

# Allow a small grace period so a meeting scheduled "right now" isn't rejected.
PAST_GRACE = timedelta(minutes=1)

EMAIL_PATTERN = r"^[^@\s]+@[^@\s]+\.[^@\s]+$"


# ---------- Auth ----------

class LoginRequest(BaseModel):
    model_config = ConfigDict(str_strip_whitespace=True)

    email: str = Field(pattern=EMAIL_PATTERN, max_length=255)
    password: str = Field(min_length=1, max_length=128)

    @field_validator("email")
    @classmethod
    def lowercase_email(cls, email: str) -> str:
        return email.lower()


class SignupRequest(LoginRequest):
    name: str = Field(min_length=1, max_length=100)
    password: str = Field(min_length=8, max_length=128)


class ProfileUpdate(BaseModel):
    """Fields a user may change about themselves (email is the login, so it stays fixed)."""

    model_config = ConfigDict(str_strip_whitespace=True)

    name: str = Field(min_length=1, max_length=100)


class UserOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    name: str
    email: str


class AuthResponse(BaseModel):
    token: str
    user: UserOut


# ---------- Meeting requests ----------

class MeetingCreate(BaseModel):
    """The host is the logged-in user, so it isn't part of the request body."""

    model_config = ConfigDict(str_strip_whitespace=True)

    meeting_type: Literal["instant", "scheduled"] = "instant"
    title: str = Field(default="", max_length=200)
    description: str = Field(default="", max_length=1000)
    scheduled_at: datetime | None = None  # required for scheduled meetings
    duration_minutes: int = Field(default=60, ge=15, le=24 * 60)

    @model_validator(mode="after")
    def check_scheduled_fields(self):
        if self.meeting_type == "scheduled":
            if not self.title:
                raise ValueError("Topic is required for a scheduled meeting")
            if self.scheduled_at is None:
                raise ValueError("Date and time are required for a scheduled meeting")
            # Store everything as naive UTC (a time without an offset is treated as UTC).
            if self.scheduled_at.tzinfo is not None:
                self.scheduled_at = self.scheduled_at.astimezone(timezone.utc).replace(tzinfo=None)
            if self.scheduled_at < utc_now() - PAST_GRACE:
                raise ValueError("Meeting time must be in the future")
        return self


class JoinRequest(BaseModel):
    model_config = ConfigDict(str_strip_whitespace=True)

    display_name: str = Field(min_length=1, max_length=100)
    is_muted: bool = True  # chosen on the pre-join screen


class ParticipantUpdate(BaseModel):
    is_muted: bool


class SignalCreate(BaseModel):
    """A WebRTC offer/answer for one other participant. The sender comes from the participant token."""

    to: int
    kind: Literal["offer", "answer"]
    sdp: str = Field(min_length=1, max_length=20_000)


class IceServersOut(BaseModel):
    ice_servers: list[dict]
    relay: bool  # False = no TURN relay configured: some networks won't be able to connect


class SignalOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    sender_id: int
    kind: str
    sdp: str


class MessageCreate(BaseModel):
    """The sender is identified by their participant token, not by anything in the body."""

    model_config = ConfigDict(str_strip_whitespace=True)

    text: str = Field(min_length=1, max_length=1000)


# ---------- Meeting responses ----------

class ParticipantOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    display_name: str
    is_host: bool
    is_muted: bool
    joined_at: UTCDateTime
    left_at: UTCDateTime | None


class JoinResponse(ParticipantOut):
    """Returned only to the person who joined: includes their secret participant token."""

    token: str


class MessageOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    participant_id: int
    sender_name: str
    text: str
    sent_at: UTCDateTime


class MeetingOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    meeting_code: str
    title: str
    description: str
    meeting_type: str
    status: str
    host_name: str
    scheduled_at: UTCDateTime
    duration_minutes: int
    created_at: UTCDateTime
    ended_at: UTCDateTime | None
    participant_count: int

    @computed_field
    @property
    def invite_link(self) -> str:
        return f"{FRONTEND_URL}/join/{self.meeting_code}"


class MeetingDetail(MeetingOut):
    active_participants: list[ParticipantOut]
    messages: list[MessageOut]
