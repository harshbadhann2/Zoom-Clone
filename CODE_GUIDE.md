# Code Guide

A map for reading this project. Read it top to bottom once, then use it to find things.

## The big picture

```
Browser (Next.js pages)  ──fetch──▶  FastAPI (routes → services)  ──SQLAlchemy──▶  SQLite
        │                                                                              ▲
        └──── WebRTC audio/video goes directly browser ↔ browser (the API only relays setup messages)
```

Three ideas explain almost everything:

1. **Every API call goes through `frontend/lib/api.ts`.** Components never write URLs.
2. **The backend has three layers.**
   - `routes.py`: receives the HTTP request and checks who is calling.
   - `services.py`: the rules ("only the host can end a meeting").
   - `models.py`: the database tables.
3. **Two kinds of "who are you" tokens.**
   - The **login token** (header `Authorization: Bearer …`) proves which *user* you are. It's needed for your dashboard, creating meetings and Settings.
   - The **participant token** (header `X-Participant-Token`) proves which *person in a meeting* you are. It's needed for mute, leave, chat, audio/video setup and host controls. Guests have one even without an account.

## Suggested reading order (about 1 hour)

1. `backend/app/models.py`: the tables, which show what the app stores.
2. `backend/app/schemas.py`: what each request and response looks like, plus the validation rules.
3. `backend/app/services.py`: the business rules, as short functions.
4. `backend/app/routes.py` and `backend/app/auth.py`: the URL each rule is exposed at, and who may call it.
5. `frontend/lib/api.ts`: the same endpoints as seen from the browser.
6. `frontend/app/page.tsx`: the dashboard, then `components/` for the parts it uses.
7. `frontend/app/meeting/[meetingCode]/page.tsx`: the meeting room, then the hooks it uses.
8. `frontend/lib/useMeetingMedia.ts` and `frontend/lib/webrtc.ts`: audio/video, best read last.

## Backend files (`backend/app/`)

| File | What it does |
|---|---|
| `main.py` | Creates the app, sets CORS (only our frontend may call it), creates tables, adds sample data on startup |
| `config.py` | Reads environment variables (database file, frontend URL, optional TURN relay) |
| `database.py` | Database connection; `get_db()` gives each request its own session |
| `models.py` | Tables: users, sessions, meetings, participants, messages, signals |
| `schemas.py` | Request and response shapes; validation (e.g. "meeting time must be in the future") |
| `services.py` | The rules: create/list/join/start/leave/end meetings, mute all, chat, signals |
| `routes.py` | Meeting endpoints; `current_participant()` turns the participant token into "who is calling" |
| `auth.py` | Sign up, log in, log out, profile; password hashing; `get_current_user()` |
| `ice.py` | Which STUN/TURN servers browsers should use for audio/video |
| `seed.py` | Demo user and sample meetings when the database is empty |

## Frontend files (`frontend/`)

**Pages (`app/`)**

| Page | URL | What it does |
|---|---|---|
| `login/page.tsx` | `/login` | Sign in / sign up / "Continue as demo user" / join as a guest |
| `page.tsx` | `/` | Dashboard: greeting, action tiles, upcoming and recent meetings |
| `join/[meetingCode]/page.tsx` | `/join/{id}` | Pre-join screen (what invite links open): name, mic and camera |
| `meeting/[meetingCode]/page.tsx` | `/meeting/{id}?pid=…` | The meeting room |
| `not-found.tsx` | anything else | 404 page |

**Helpers and hooks (`lib/`)**

| File | What it does |
|---|---|
| `api.ts` | Every backend call (adds the right token header, turns errors into readable messages) |
| `auth.ts` | Stores the login token (localStorage) and participant tokens (sessionStorage, one per tab) |
| `meeting.ts` | Small pure helpers: parse a Meeting ID or invite link, format dates/IDs, screen-share error text |
| `useCurrentTime.ts` | The dashboard clock (read in the browser, not at build time) |
| `useDashboardMeetings.ts` | Loads upcoming and recent meetings, each with its own loading and error state |
| `useMeetingPolling.ts` | Meeting room data, re-fetched every 3 seconds |
| `useLocalMedia.ts` | Your own camera and screen share |
| `useMeetingMedia.ts` | Real audio/video with the other participants (WebRTC) |
| `webrtc.ts` | The low-level WebRTC steps (make an offer, make an answer, swap tracks) |

**Components (`components/`)**: dashboard pieces (`Navbar`, `ActionTile`, `UpcomingMeetings`, `RecentMeetings`), dialogs (`Modal`, `JoinMeetingModal`, `ScheduleMeetingModal`, `SettingsModal`), and in `room/` the meeting room pieces (`RoomHeader`, `VideoGrid`, `VideoTile`, `ControlBar`, `ParticipantsPanel`, `ChatPanel`, `RemoteAudio`, `SharePrompt`, `RoomMessage`).

## The main flows, step by step

**1. Sign in with the demo account**
1. `app/login/page.tsx` calls `logIn()` (`lib/api.ts`), which sends `POST /api/auth/login`.
2. `auth.py → login()` checks the password with `verify_password()`, then `start_session()` saves a random token in the `sessions` table.
3. The browser stores the token (`saveToken()`), and from then on `api.ts` sends it with every request.

**2. New meeting**
1. The dashboard's `handleNewMeeting()` calls `createInstantMeeting()`, which sends `POST /api/meetings`.
2. `services.create_meeting()` makes the 10-digit ID with `generate_meeting_code()` and saves the meeting.
3. `startMeeting()` sends `POST /api/meetings/{id}/start`. `services.start_meeting()` checks that you own the meeting and adds you as the **host**.
4. The response includes your participant token, which `api.ts` saves for this tab.
5. The browser goes to `/meeting/{id}?pid=…`.

**3. Join with an invite link**
1. `/join/{id}` loads the meeting with `GET /api/meetings/{id}`. A 404 shows "Meeting not found".
2. You type your name and press Join. That calls `joinMeeting()`, which sends `POST /api/meetings/{id}/join`.
3. `services.join_meeting()` adds you as a **guest**, always: only `/start` can make a host.

**4. Inside the meeting room**
- `useMeetingPolling` fetches `GET /api/meetings/{id}` every 3 s, which returns the participants, chat and status. That's how you see people join and leave, see mute changes, and learn when you're removed or the meeting ends.
- **Mute:** `handleToggleMute()` sends `PATCH /participants/me`. The server identifies you by your participant token.
- **Chat:** `ChatPanel` → `handleSendMessage()` sends `POST /messages`. Other people get the message on their next refresh.
- **Host controls:** `runHostAction()` calls `/end`, `/mute-all` or `/participants/{id}/remove`. `services.require_host()` refuses anyone who isn't the host, with 403.

**5. Audio and video (WebRTC)**
1. `useMeetingMedia` asks the API for STUN/TURN servers (`GET /ice-servers`).
2. Every second it checks the participant list. For each *older* participant without a connection, it **calls** them: `createOffer()` (`webrtc.ts`), then `POST /signals`.
3. The older participant picks up the offer (`GET /signals`), replies with `createAnswer()`, then `POST /signals`.
4. The browsers connect directly, and the media flows between them, never through our server.
5. Mic, camera and screen share are swapped into the connection with `setOutgoingTracks()`. Mute disables the mic track, so silence is sent.
6. Each tile shows "Connecting…" / "Can't connect" from `media.status`. Without a TURN relay, some networks (mobile data) can't connect.

## Where do I change…?

| I want to change… | Look in |
|---|---|
| A validation rule (e.g. allowed duration) | `backend/app/schemas.py` |
| Who may do something | `backend/app/services.py` (`require_host`, `start_meeting`) |
| A database column | `backend/app/models.py` (then delete the local `.db` file) |
| An error message the user sees | The backend `detail` text, or the component that shows it |
| Colors, fonts, button styles | `frontend/app/globals.css` (Zoom design tokens and `.btn-primary` / `.btn-secondary`) |
| The toolbar buttons | `frontend/components/room/ControlBar.tsx` |
| How often the room refreshes | `POLL_INTERVAL_MS` in `frontend/lib/useMeetingPolling.ts` |
