"""Sample data so the dashboard isn't empty on first run.

Runs on startup only when the meetings table is empty. Dates are relative to today,
so there are always meetings in both Upcoming and Recent. Times are in UTC
(04:30 UTC = 10:00 in India, the reference time zone for this demo).
"""

from datetime import datetime, timedelta

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.models import Meeting, Participant, utc_now
from app.services import generate_meeting_code

HOST_NAME = "Harsh Badhan"

# (title, description, days from today, UTC time "HH:MM", duration in minutes)
UPCOMING = [
    ("Team Standup", "Daily sync: yesterday, today, blockers.", 1, "04:30", 15),
    ("Product Design Review", "Walk through the new onboarding flow mockups.", 1, "08:30", 60),
    ("Engineering Sync", "Sprint planning and API contract review.", 2, "05:30", 45),
    ("Project Discussion", "Q4 roadmap priorities with stakeholders.", 4, "09:30", 30),
]

# (title, description, days ago, UTC time "HH:MM", duration in minutes, other participants)
RECENT = [
    ("Client Demo Rehearsal", "Dry run before Friday's client demo.", 1, "10:30", 30, ["Priya Sharma", "Alex Chen"]),
    ("Sprint Retrospective", "What went well, what didn't, action items.", 2, "06:30", 60,
     ["Priya Sharma", "Rahul Verma", "Emily Davis"]),
    ("Weekly 1:1", "Career goals and project check-in.", 3, "09:00", 30, ["Neha Gupta"]),
    ("Architecture Deep Dive", "Discussed the move to an event-driven notifications service.", 5, "08:30", 90,
     ["Alex Chen", "Rahul Verma", "Emily Davis", "Neha Gupta"]),
]


def at(days_from_today: int, utc_time: str) -> datetime:
    hour, minute = map(int, utc_time.split(":"))
    today = utc_now().replace(hour=hour, minute=minute, second=0, microsecond=0)
    return today + timedelta(days=days_from_today)


def seed_sample_data(db: Session) -> None:
    if db.scalar(select(Meeting.id).limit(1)) is not None:
        return

    for title, description, days_ahead, utc_time, duration in UPCOMING:
        db.add(Meeting(
            meeting_code=generate_meeting_code(db), title=title, description=description,
            meeting_type="scheduled", status="scheduled", host_name=HOST_NAME,
            scheduled_at=at(days_ahead, utc_time), duration_minutes=duration,
        ))
        db.flush()  # so the next generate_meeting_code() sees this code

    for title, description, days_ago, utc_time, duration, guests in RECENT:
        start = at(-days_ago, utc_time)
        end = start + timedelta(minutes=duration)
        meeting = Meeting(
            meeting_code=generate_meeting_code(db), title=title, description=description,
            meeting_type="scheduled", status="ended", host_name=HOST_NAME,
            scheduled_at=start, duration_minutes=duration, ended_at=end, created_at=start - timedelta(days=1),
        )
        meeting.participants = [
            Participant(display_name=name, is_host=(name == HOST_NAME), joined_at=start, left_at=end)
            for name in [HOST_NAME, *guests]
        ]
        db.add(meeting)
        db.flush()

    db.commit()
