"""Pydantic schemas: the shape of request bodies (validated) and responses."""

from datetime import datetime, timedelta, timezone
from typing import Annotated, Literal

from pydantic import AfterValidator, BaseModel, ConfigDict, Field, computed_field, model_validator

from app.config import FRONTEND_URL
from app.models import utc_now


def as_utc(value: datetime) -> datetime:
    """Database datetimes are naive UTC; tag them so JSON gets a '+00:00' suffix."""
    return value.replace(tzinfo=timezone.utc) if value.tzinfo is None else value


UTCDateTime = Annotated[datetime, AfterValidator(as_utc)]

# Allow a small grace period so a meeting scheduled "right now" isn't rejected.
PAST_GRACE = timedelta(minutes=1)


# ---------- Requests ----------

class MeetingCreate(BaseModel):
    model_config = ConfigDict(str_strip_whitespace=True)

    meeting_type: Literal["instant", "scheduled"] = "instant"
    host_name: str = Field(min_length=1, max_length=100)
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
    # No authentication in this assignment: the default user's own client says it is the host.
    as_host: bool = False


class ParticipantUpdate(BaseModel):
    is_muted: bool


class HostAction(BaseModel):
    """Body for host-only actions. The server checks this participant really is the host."""

    host_participant_id: int


# ---------- Responses ----------

class ParticipantOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    display_name: str
    is_host: bool
    is_muted: bool
    joined_at: UTCDateTime
    left_at: UTCDateTime | None


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
    participant_count: int

    @computed_field
    @property
    def invite_link(self) -> str:
        return f"{FRONTEND_URL}/join/{self.meeting_code}"


class MeetingDetail(MeetingOut):
    active_participants: list[ParticipantOut]
