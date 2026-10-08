"""Database tables.

meetings 1 ──< participants   (one meeting has many participants)

All datetimes are stored as UTC without timezone info (SQLite has no timezone type).
"""

from datetime import datetime, timedelta, timezone

from sqlalchemy import CheckConstraint, ForeignKey, String, Text
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.database import Base


def utc_now() -> datetime:
    return datetime.now(timezone.utc).replace(tzinfo=None)


class Meeting(Base):
    __tablename__ = "meetings"
    __table_args__ = (
        CheckConstraint("meeting_type IN ('instant', 'scheduled')", name="valid_meeting_type"),
        CheckConstraint("status IN ('scheduled', 'live', 'ended')", name="valid_status"),
        CheckConstraint("duration_minutes > 0", name="positive_duration"),
    )

    id: Mapped[int] = mapped_column(primary_key=True)
    # The public, shareable 10-digit "Meeting ID". UNIQUE is enforced by the database.
    meeting_code: Mapped[str] = mapped_column(String(10), unique=True, index=True)
    title: Mapped[str] = mapped_column(String(200))
    description: Mapped[str] = mapped_column(Text, default="")
    meeting_type: Mapped[str] = mapped_column(String(20))  # "instant" or "scheduled"
    status: Mapped[str] = mapped_column(String(20), default="scheduled")  # scheduled -> live -> ended
    host_name: Mapped[str] = mapped_column(String(100))
    scheduled_at: Mapped[datetime]
    duration_minutes: Mapped[int]
    created_at: Mapped[datetime] = mapped_column(default=utc_now)
    updated_at: Mapped[datetime] = mapped_column(default=utc_now, onupdate=utc_now)
    ended_at: Mapped[datetime | None]

    participants: Mapped[list["Participant"]] = relationship(
        back_populates="meeting", cascade="all, delete-orphan", order_by="Participant.joined_at"
    )

    @property
    def ends_at(self) -> datetime:
        return self.scheduled_at + timedelta(minutes=self.duration_minutes)

    @property
    def active_participants(self) -> list["Participant"]:
        return [p for p in self.participants if p.left_at is None]

    @property
    def participant_count(self) -> int:
        """Everyone who ever joined (used for the Recent Meetings list)."""
        return len(self.participants)


class Participant(Base):
    __tablename__ = "participants"

    id: Mapped[int] = mapped_column(primary_key=True)
    meeting_id: Mapped[int] = mapped_column(ForeignKey("meetings.id", ondelete="CASCADE"), index=True)
    display_name: Mapped[str] = mapped_column(String(100))
    is_host: Mapped[bool] = mapped_column(default=False)
    is_muted: Mapped[bool] = mapped_column(default=True)
    joined_at: Mapped[datetime] = mapped_column(default=utc_now)
    left_at: Mapped[datetime | None]  # NULL while the person is still in the meeting

    meeting: Mapped[Meeting] = relationship(back_populates="participants")
