# Zoom Clone

A Zoom-style video meeting web app built for the SDE Fullstack assignment. You can start an instant meeting, join one by Meeting ID or invite link, schedule meetings for later, and manage a meeting room as the host.

**Live demo:** https://harsh-zoom-clone.vercel.app
**API:** https://zoom-clone-api-delta.vercel.app (interactive docs at [`/docs`](https://zoom-clone-api-delta.vercel.app/docs))

---

## Features

### Mandatory
| Feature | What it does |
|---|---|
| **Landing dashboard** | Navbar with Home/Meetings/Chat/Contacts tabs, search, notifications, settings and a profile menu (placeholders). Zoom's four action tiles, a live-clock card with **Upcoming meetings**, and a **Recent meetings** list. |
| **Instant meeting** | **New meeting** creates the meeting on the server, which generates a unique 10-digit Meeting ID and invite link and stores both in SQLite. The host is then taken into the room, where the invite link is shown. |
| **Join meeting** | Accepts a Meeting ID (`614 838 5880`, `614-838-5880`) **or** a full invite link, plus a display name. The input is checked in the browser, then the server checks the meeting exists and hasn't ended. |
| **Schedule meeting** | Topic, description, date, time (in your own time zone) and duration. The server validates and stores it, and the meeting appears under Upcoming with its generated link. |

### Bonus
- **Responsive**: works on desktop, tablet and phone (the participants panel becomes full-screen on phones).
- **Host controls**: **Mute all**, **Remove participant**, and **End meeting for all**. Only the host can use them, and the server checks this.
- **Real camera preview** (`getUserMedia`) and **real screen sharing** (`getDisplayMedia`) on your own screen.
- **Live participant list**: open the invite link in another tab or browser and both rooms show each other, including mute status.
- Invite-link page (`/join/{id}`), copy invitation, delete a scheduled meeting, and loading, empty and error states throughout.

---

## Tech stack

| Layer | Choice | Why |
|---|---|---|
| Frontend | **Next.js 16** (App Router, React 19, TypeScript) + **Tailwind CSS 4** | Required by the assignment. Pages are client components, so the app behaves like a single-page application. |
| Icons | `lucide-react` | The only extra UI dependency. |
| Backend | **FastAPI** + **Pydantic** | Request validation and automatic API docs. |
| ORM | **SQLAlchemy 2** | Typed models with real relationships and constraints. |
| Database | **SQLite** | Required by the assignment. |

---

## Architecture

```
Browser (Next.js pages + components)
   │  fetch() via lib/api.ts          JSON over HTTPS (CORS allowed for the frontend URL only)
   ▼
FastAPI  app/routes.py   → validates input with Pydantic schemas (app/schemas.py)
   │                     → calls business logic in app/services.py
   ▼
SQLAlchemy models (app/models.py)
   ▼
SQLite (meetings, participants)
```

**Real-time updates without WebSockets:** the meeting room fetches `GET /api/meetings/{id}` every 3 seconds. That is how a guest notices they were muted by "Mute all", removed, or that the meeting ended. It is simple to explain and enough at this scale. Moving to WebSockets would be the next step for real video.

### Project structure

```
backend/
  app/
    main.py        FastAPI app: CORS, startup (create tables + seed), readable validation errors
    config.py      Environment variables (DATABASE_URL, FRONTEND_URL)
    database.py    Engine, session-per-request dependency, SQLite foreign keys ON
    models.py      Meeting and Participant tables
    schemas.py     Pydantic request/response shapes + validation rules
    services.py    Business logic: meeting ID generation, upcoming/recent rules, join/leave, host actions
    routes.py      REST endpoints (thin: validate → call service → return)
    seed.py        Sample meetings for a non-empty first run
  tests/           pytest API tests (in-memory SQLite)

frontend/
  app/
    page.tsx                       Dashboard
    join/[meetingCode]/page.tsx    Invite-link pre-join page
    meeting/[meetingCode]/page.tsx Meeting room
  components/                      Navbar, modals, meeting lists, toast, avatar
  components/room/                 VideoTile, ControlBar, ParticipantsPanel
  lib/api.ts                       Every backend call lives here
  lib/meeting.ts                   Pure helpers (parse Meeting ID/link, formatting) + tests
  types/meeting.ts                 TypeScript types matching the API responses
```

---

## Database schema

```
meetings                                   participants
─────────────────────────────              ───────────────────────────────
id               INTEGER PK                id            INTEGER PK
meeting_code     VARCHAR(10) UNIQUE  ◄──┐  meeting_id    INTEGER FK → meetings.id (ON DELETE CASCADE)
title            VARCHAR(200)           │  display_name  VARCHAR(100)
description      TEXT                   └─ is_host       BOOLEAN
meeting_type     'instant' | 'scheduled'   is_muted      BOOLEAN
status           'scheduled' | 'live' | 'ended'   joined_at  DATETIME
host_name        VARCHAR(100)              left_at       DATETIME NULL  (NULL = still in the meeting)
scheduled_at     DATETIME (UTC)
duration_minutes INTEGER  CHECK > 0
created_at / updated_at / ended_at
```

- **One-to-many:** a meeting has many participants. Deleting a meeting deletes its participants (cascade).
- **`id` vs `meeting_code`:** `id` is the internal key used by foreign keys. `meeting_code` is the public, shareable 10-digit "Meeting ID". Keeping them separate means the public ID can never break a relationship.
- **Constraints in the database, not only in code:** a `UNIQUE` index on `meeting_code`, `CHECK` constraints on `meeting_type`, `status` and `duration_minutes`, and SQLite foreign keys switched on (`PRAGMA foreign_keys = ON`).
- **Participant history is kept:** leaving sets `left_at` instead of deleting the row, so Recent meetings can show how many people attended.
- **Times** are stored in UTC. The API returns ISO strings with `Z`, and the browser shows them in local time.

### Upcoming vs recent
- **Upcoming** = status is not `ended` **and** the time slot (`scheduled_at + duration`) hasn't finished. These are sorted soonest first.
- **Recent** = everything else, i.e. meetings ended by the host or whose time slot is over (shown as "Missed" if nobody started them). These are sorted newest first.

---

## API

| Method | Endpoint | Purpose |
|---|---|---|
| `POST` | `/api/meetings` | Create a meeting. `meeting_type: "instant"` starts now. `"scheduled"` requires `title` and a future `scheduled_at`. |
| `GET` | `/api/meetings/upcoming` | Upcoming meetings |
| `GET` | `/api/meetings/recent` | Recent meetings (latest 10) |
| `GET` | `/api/meetings/{meeting_code}` | Meeting details + active participants (the room polls this) |
| `DELETE` | `/api/meetings/{meeting_code}` | Delete a meeting that isn't in progress |
| `POST` | `/api/meetings/{meeting_code}/join` | `{display_name, as_host}` → creates a participant (404 if missing, 409 if ended) |
| `PATCH` | `/api/meetings/{meeting_code}/participants/{id}` | `{is_muted}`: mute or unmute yourself |
| `POST` | `/api/meetings/{meeting_code}/participants/{id}/leave` | Leave the meeting |
| `POST` | `/api/meetings/{meeting_code}/end` | Host only: end for everyone |
| `POST` | `/api/meetings/{meeting_code}/mute-all` | Host only: mute every guest |
| `POST` | `/api/meetings/{meeting_code}/participants/{id}/remove` | Host only: remove a participant |
| `GET` | `/api/health` | Health check |

Host-only endpoints take `{"host_participant_id": n}`, and the server returns `403` unless that participant is the meeting's active host. Validation errors return `422` with one readable sentence, e.g. `{"detail": "Meeting time must be in the future"}`.

---

## Local setup

**Requirements:** Python 3.12+, Node.js 20+.

### 1. Backend (http://localhost:8000)
```bash
cd backend
python3 -m venv .venv
source .venv/bin/activate          # Windows: .venv\Scripts\activate
pip install -r requirements.txt
uvicorn app.main:app --reload
```
The SQLite file `backend/zoom_clone.db` is created and filled with sample data on first start. API docs are at http://localhost:8000/docs.

### 2. Frontend (http://localhost:3000)
```bash
cd frontend
cp .env.example .env.local         # points the app at http://localhost:8000
npm install
npm run dev
```

### Tests
```bash
cd backend && pytest               # 15 API tests
cd frontend && npm test            # helper unit tests (Node's built-in test runner)
cd frontend && npm run lint && npm run build
```

---

## Environment variables

| Where | Variable | Default | Purpose |
|---|---|---|---|
| backend | `DATABASE_URL` | `sqlite:///./zoom_clone.db` | SQLite file location |
| backend | `FRONTEND_URL` | `http://localhost:3000` | Used to build invite links and as the only allowed CORS origin |
| frontend | `NEXT_PUBLIC_API_URL` | `http://localhost:8000` | Base URL of the FastAPI backend |

The backend reads real environment variables, and the defaults work for local development. No secrets are needed or committed.

## Sample data

On startup, if the `meetings` table is empty, `app/seed.py` adds 4 upcoming meetings (Team Standup, Product Design Review, Engineering Sync, Project Discussion) and 4 recent meetings with participants. Dates are relative to today, so the dashboard always looks realistic. To reset, delete `backend/zoom_clone.db` and restart.

---

## Deployment

Both apps are deployed on **Vercel** as two projects from this repo.

| Project | Root directory | Settings |
|---|---|---|
| Frontend (`zoom-clone-harsh`) | `frontend/` | Next.js preset. `NEXT_PUBLIC_API_URL=https://zoom-clone-api-delta.vercel.app` |
| Backend (`zoom-clone-api`) | `backend/` | FastAPI preset (entrypoint `app/main.py`). `DATABASE_URL=sqlite:////tmp/zoom_clone.db`, `FRONTEND_URL=https://harsh-zoom-clone.vercel.app` |

Deploy with the Vercel CLI from each folder: `vercel deploy --prod`.

**About SQLite in production:** serverless functions can only write to `/tmp`, and that storage is temporary. Data lives as long as the function instance stays warm. After a cold start the database is recreated and re-seeded. That is fine for a demo, and it keeps the assignment's SQLite requirement. For permanent data, run the same backend on a host with a persistent disk (for example a Render or Railway service with a volume, `DATABASE_URL=sqlite:////data/zoom_clone.db`) with no code changes.

---

## Assumptions

- **No authentication.** As the assignment says, there is a default logged-in user (`CURRENT_USER` in `frontend/lib/meeting.ts`), who is the host of meetings they start. Guests joining by ID or link only enter a display name.
- **No real audio/video transport.** Your own camera and screen share are real but only shown on your own screen. Other participants appear as avatar tiles. Presence, mute state and host actions are real and shared through the API.
- Meeting IDs are 10 random digits generated on the server. Uniqueness is checked before insert and enforced by a `UNIQUE` index.
- Closing a browser tab without clicking Leave keeps that participant listed until the meeting ends (there is no presence heartbeat).

## Evaluation notes

- **Kept deliberately simple:** a flat backend (`routes → services → models`), no state-management library, plain `fetch`, and the native `<dialog>` element for modals (Escape key and focus handling come free). The only UI dependency is an icon library.
- **Validation happens twice:** the browser gives instant feedback, and the server is the source of truth (Pydantic plus database constraints).
- **Polling instead of WebSockets** keeps the room easy to explain while still syncing between participants.
