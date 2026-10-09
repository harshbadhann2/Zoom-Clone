# Zoom Clone

A Zoom-inspired **meeting management** web app built for the SDE Fullstack assignment. You can sign in, start an instant meeting, join one by Meeting ID or invite link, schedule meetings for later, chat in the meeting, and manage participants as the host. It is not a real-time audio/video conferencing platform: see [Known limitations](#known-limitations).

**Live demo:** https://harsh-zoom-clone.vercel.app. Click **Sign In → Continue as demo user** (`demo@zoomclone.app` / `zoomdemo123`), or create your own account.
**API:** https://zoom-clone-api-gb8b.onrender.com (interactive docs at [`/docs`](https://zoom-clone-api-gb8b.onrender.com/docs)). It runs on Render's free plan, so the first request after 15 idle minutes takes about 30–60 seconds while it wakes up.

---

## Features

### Mandatory
| Feature | What it does |
|---|---|
| **Landing dashboard** | Navbar with Home/Meetings/Chat/Contacts tabs, search and notifications (placeholders), a working **Settings** dialog (gear icon or profile menu → Profile/Settings: change your display name, saved on the server) and Sign out. Zoom's four action tiles, a live-clock card with **Upcoming meetings**, and a **Recent meetings** list. |
| **Instant meeting** | **New meeting** creates the meeting on the server, which generates a unique 10-digit Meeting ID and invite link and stores both in SQLite. The host is then taken into the room, where the invite link is shown. |
| **Join meeting** | Same flow as Zoom. The **Join Meeting** dialog takes a Meeting ID (`614 838 5880`, `614-838-5880`) **or** a full invite link and checks with the server that the meeting exists. The **pre-join page** (`/join/{id}`, also what invite links open) then asks for your display name and lets you choose microphone and camera with a live preview. |
| **Schedule meeting** | Topic, description, date, time (in your own time zone) and duration. The server validates and stores it, and the meeting appears under Upcoming with its generated link. |

### Bonus
- **User authentication**: Sign Up / Sign In / Sign Out. Passwords are hashed with salted PBKDF2, and login tokens are stored in a `sessions` table. A seeded demo account covers the brief's "assume a default user is logged in", with one-click sign-in. Guests can join meetings without an account, as in Zoom.
- **Responsive**: works on desktop, tablet and phone (the side panels become full-screen on phones).
- **Host controls**: **Mute all**, **Remove participant**, and **End meeting for all**. The host is decided by the server (the signed-in owner of the meeting), not by the browser.
- **In-meeting chat**: messages are stored in SQLite and shared with everyone in the meeting, with an unread badge on the Chat button.
- **Real camera preview** (`getUserMedia`) and **real screen sharing** (`getDisplayMedia`) on your own screen.
- **Live participant list**: open the invite link in another browser and both rooms show each other, including mute status.
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

**Real-time updates without WebSockets:** the meeting room fetches `GET /api/meetings/{id}` every 3 seconds. That one response carries the participants and the chat, so it is how a guest sees new messages, notices they were muted by "Mute all" or removed, or learns the meeting ended. It is simple to explain and enough at this scale. Moving to WebSockets would be the next step for real video.

**Authentication:** after signing in, the browser keeps a random token (in `localStorage`) and sends it as `Authorization: Bearer <token>`. FastAPI's `get_current_user` dependency looks the token up in the `sessions` table.

**Meeting permissions:** joining returns a secret **participant token** (kept in `sessionStorage`, so each browser tab is its own participant). Leave, mute, chat and the host controls require it in an `X-Participant-Token` header, and host controls also require that participant to be the host. Participant IDs are visible to everyone in the meeting, so an ID alone must never be enough to act; a regression test (`test_outsider_cannot_act_with_public_ids`) checks this.

### Project structure

```
backend/
  app/
    main.py        FastAPI app: CORS, startup (create tables + seed), readable validation errors
    config.py      Environment variables (DATABASE_URL, FRONTEND_URL)
    auth.py        Sign up / sign in / sign out, password hashing, current-user dependency
    database.py    Engine, session-per-request dependency, SQLite foreign keys ON
    models.py      User, AuthSession, Meeting, Participant and Message tables
    schemas.py     Pydantic request/response shapes + validation rules
    services.py    Business logic: meeting ID generation, upcoming/recent rules, join/leave, chat, host actions
    routes.py      REST endpoints (thin: validate → call service → return)
    seed.py        Demo user + sample meetings for a non-empty first run
  tests/           pytest API tests (in-memory SQLite)

frontend/
  app/
    page.tsx                       Dashboard (redirects to /login if not signed in)
    login/page.tsx                 Sign in / sign up / join as guest
    join/[meetingCode]/page.tsx    Pre-join page: name, mic and camera preview
    meeting/[meetingCode]/page.tsx Meeting room
  components/                      Navbar, modals, meeting lists, toast, avatar
  components/room/                 VideoTile, ControlBar, ParticipantsPanel, ChatPanel
  lib/api.ts                       Every backend call lives here
  lib/auth.ts                      Stores the login token in the browser
  lib/meeting.ts                   Pure helpers (parse Meeting ID/link, formatting) + tests
  types/meeting.ts                 TypeScript types matching the API responses
```

---

## Database schema

```
users                         sessions                      meetings
──────────────────────        ──────────────────────        ─────────────────────────────────────
id            PK              token     PK (random)         id               PK
name                          user_id   FK → users.id       meeting_code     VARCHAR(10) UNIQUE
email         UNIQUE          created_at                    host_user_id     FK → users.id
password_hash (salt$hash)                                   title, description
created_at                                                  meeting_type     'instant' | 'scheduled'
                                                            status           'scheduled' | 'live' | 'ended'
                                                            scheduled_at (UTC), duration_minutes CHECK > 0
                                                            created_at / updated_at / ended_at

participants                                  messages
────────────────────────────────────          ─────────────────────────────────────
id            PK                              id              PK
meeting_id    FK → meetings.id (CASCADE)      meeting_id      FK → meetings.id (CASCADE)
display_name                                  participant_id  FK → participants.id (CASCADE)
is_host, is_muted                             text            VARCHAR(1000)
joined_at                                     sent_at
left_at       NULL = still in the meeting
```

**Relationships:** users 1──< meetings (host), users 1──< sessions, meetings 1──< participants, meetings 1──< messages, participants 1──< messages (sender).

- **Participants are not users.** Guests join with just a display name, as in Zoom, so `participants` stores the name used in that meeting rather than requiring an account.
- **`id` vs `meeting_code`:** `id` is the internal key used by foreign keys. `meeting_code` is the public, shareable 10-digit "Meeting ID". Keeping them separate means the public ID can never break a relationship.
- **Host name isn't duplicated:** it comes from `meetings.host_user_id → users.name`, so renaming a user can't leave old meetings out of date.
- **Constraints in the database, not only in code:** `UNIQUE` on `meeting_code` and `email`, `CHECK` constraints on `meeting_type`, `status` and `duration_minutes`, and SQLite foreign keys switched on (`PRAGMA foreign_keys = ON`).
- **Participant history is kept:** leaving sets `left_at` instead of deleting the row, so Recent meetings can show how many people attended.
- **Sessions are rows**, so signing out deletes the row and the token stops working immediately.
- **Times** are stored in UTC. The API returns ISO strings with `Z`, and the browser shows them in local time.

### Upcoming vs recent
- **Upcoming** = status is not `ended` **and** the time slot (`scheduled_at + duration`) hasn't finished. These are sorted soonest first.
- **Recent** = everything else, i.e. meetings ended by the host or whose time slot is over (shown as "Missed" if nobody started them). These are sorted newest first.

---

## API

🔒 = requires `Authorization: Bearer <token>`.

| Method | Endpoint | Purpose |
|---|---|---|
| `POST` | `/api/auth/signup` | `{name, email, password}` → `{token, user}` (409 if the email is taken) |
| `POST` | `/api/auth/login` | `{email, password}` → `{token, user}` (401 if wrong) |
| `GET` 🔒 | `/api/auth/me` | The signed-in user |
| `PATCH` 🔒 | `/api/auth/me` | `{name}`: change your own display name (only ever changes the signed-in user) |
| `POST` | `/api/auth/logout` | Deletes the session |
| `POST` 🔒 | `/api/meetings` | Create a meeting hosted by you. `meeting_type: "instant"` starts now. `"scheduled"` requires `title` and a future `scheduled_at`. |
| `GET` 🔒 | `/api/meetings/upcoming` | Your upcoming meetings |
| `GET` 🔒 | `/api/meetings/recent` | Your recent meetings (latest 10) |
| `GET` | `/api/meetings/{meeting_code}` | Meeting details + active participants + chat (public, because guests need it. The room polls this) |
| `DELETE` 🔒 | `/api/meetings/{meeting_code}` | Delete your meeting if it isn't in progress |
| `POST` | `/api/meetings/{meeting_code}/join` | `{display_name, is_muted}` → the new participant **plus their secret `token`** (404 if missing, 409 if ended). If the signed-in owner joins, they become host. |
| `POST` 🎟️ | `/api/meetings/{meeting_code}/messages` | `{text}`: send a chat message as yourself |
| `PATCH` 🎟️ | `/api/meetings/{meeting_code}/participants/me` | `{is_muted}`: mute or unmute yourself |
| `POST` 🎟️ | `/api/meetings/{meeting_code}/participants/me/leave` | Leave the meeting |
| `POST` 🎟️ | `/api/meetings/{meeting_code}/end` | Host only: end for everyone |
| `POST` 🎟️ | `/api/meetings/{meeting_code}/mute-all` | Host only: mute every guest |
| `POST` 🎟️ | `/api/meetings/{meeting_code}/participants/{id}/remove` | Host only: remove a participant |
| `GET` | `/api/health` | Health check |

🎟️ = requires `X-Participant-Token: <token from join>`. A missing or wrong token returns `401`; a guest calling a host action returns `403`. Validation errors return `422` with one readable sentence, e.g. `{"detail": "Meeting time must be in the future"}`.

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
cd backend && pytest               # 34 API tests (meetings, auth, profile, chat, host controls, permissions)
cd frontend && npm test            # 6 helper unit tests (Node's built-in test runner)
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

On startup, if the database is empty, `app/seed.py` creates the **demo user** (`demo@zoomclone.app` / `zoomdemo123`), 4 upcoming meetings (Team Standup, Product Design Review, Engineering Sync, Project Discussion) and 4 recent meetings with participants. Dates are relative to today, so the dashboard always looks realistic. To reset, or after changing the schema, delete `backend/zoom_clone.db` and restart.

---

## Deployment

| Part | Host | Settings |
|---|---|---|
| Frontend | **Vercel**, connected to this GitHub repo, root directory `frontend/` | Next.js preset. `NEXT_PUBLIC_API_URL=https://zoom-clone-api-gb8b.onrender.com`. Every push to `main` deploys automatically. |
| Backend | **Render** (free web service) | Defined in [`render.yaml`](render.yaml): root `backend/`, `pip install -r requirements.txt`, `uvicorn app.main:app --host 0.0.0.0 --port $PORT`, health check `/api/health`, `FRONTEND_URL=https://harsh-zoom-clone.vercel.app` |

To deploy the backend: Render dashboard → **New → Blueprint** → select this repository → **Apply**.

**Why a single server for the backend:** SQLite is one file, so the API must run as **one long-running process**. Serverless platforms can run several copies at once, each with its own temporary file, and meetings and logins would appear and disappear. A Render web service is one process, so every request sees the same database.

**Free-tier limits (honest note):** Render's free plan has **no persistent disk**. Whenever the service restarts, redeploys or sleeps, the SQLite file is recreated with only the seeded sample data (the demo account always works). This was verified in production: a meeting that existed before a backend redeploy returned `404` afterwards. Two mitigations reduce (but do not remove) the risk:
- [`.github/workflows/keep-backend-awake.yml`](.github/workflows/keep-backend-awake.yml) asks GitHub Actions to ping `/api/health` every 10 minutes. **This is best-effort only:** GitHub may delay or skip scheduled runs, and in practice no scheduled run fired in the first ~2 hours after it was added (manual runs succeed). For a dependable keep-alive, add an external uptime monitor such as UptimeRobot (free plan: personal, non-commercial use, 5-minute checks) for `https://zoom-clone-api-gb8b.onrender.com/api/health`. Note that keeping one free service awake all month uses ≈ 744 of the workspace's 750 free Render hours.
- `buildFilter` in `render.yaml` makes only `backend/**` changes redeploy the API, so frontend and docs commits don't reset the data.

**What a sleeping backend looks like:** measured cold starts of ≈ 32–43 s for the first request (warm requests ≈ 0.4–0.8 s). The dashboard shows "Waking up the server…" after 5 seconds of loading, every request times out after 75 seconds with a Retry button, and each list loads or fails on its own.

**For real persistence**, move the backend to a paid Render instance with a disk mounted at `/var/data` and set `DATABASE_URL=sqlite:////var/data/zoom_clone.db`. No code changes are needed.

## Known limitations

1. **Cold starts.** The backend runs on Render's free plan, which stops it after 15 minutes without requests. The next request waits for it to start again (measured ≈ 32–43 s; warm requests ≈ 0.4–0.8 s). The dashboard shows "Waking up the server…" meanwhile, and requests time out after 75 s with a Retry button.
2. **Data is not guaranteed to persist.** SQLite lives on the free plan's temporary disk (`DATABASE_URL=sqlite:///./zoom_clone.db`). Every restart, redeploy or sleep resets it to the seeded sample data (verified: a meeting returned 404 after a redeploy). The demo account always works; accounts and meetings you create can disappear. Keeping the service awake does **not** make the data durable; only a persistent disk would.
3. **Camera and screen sharing are local previews.** They use the real browser APIs, but the video is shown only on your own screen.
4. **Screen sharing is not transmitted** to other participants (the sharing banner says "Preview only").
5. **No real-time audio/video conferencing** (no WebRTC/media server). The microphone is never captured; Mute/Unmute, presence, chat and host controls are real shared state synced through the API.

## Assumptions

- **Default user + optional accounts.** The brief says to assume a default logged-in user, so a seeded demo account is one click away on the sign-in page. Sign-up/login is implemented as the bonus. Guests joining by ID or link don't need an account, as in Zoom.
- **Media is out of scope (see Known limitations 3–5).** Camera preview and screen share use `getUserMedia` / `getDisplayMedia`; cancelling the share picker, the operating system blocking screen recording, and unsupported browsers (most phones) each show a clear message. Other participants' tiles show their name.
- **Chat visibility:** the meeting details endpoint is public (guests need it before joining), so anyone who knows a Meeting ID can read that meeting's chat. Sending messages requires being in the meeting.
- Meeting IDs are 10 random digits generated on the server. Uniqueness is checked before insert and enforced by a `UNIQUE` index.
- Closing a browser tab without clicking Leave keeps that participant listed until the meeting ends (there is no presence heartbeat).

## Evaluation notes

- **Kept deliberately simple:** a flat backend (`routes → services → models`), no state-management library, plain `fetch`, and the native `<dialog>` element for modals (Escape key and focus handling come free). The only UI dependency is an icon library. Password hashing uses Python's standard library (`hashlib.pbkdf2_hmac`), so auth adds no dependencies.
- **Zoom fidelity:** colors, font stack, button and input sizes, the Join dialog and the pre-join page were matched against Zoom's live web client (`app.zoom.us/wc`).
- **Validation happens twice:** the browser gives instant feedback, and the server is the source of truth (Pydantic plus database constraints).
- **Polling instead of WebSockets** keeps the room easy to explain while still syncing between participants.
