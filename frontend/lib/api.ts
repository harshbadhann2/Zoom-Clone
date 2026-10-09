// All calls to the FastAPI backend live here, so components never build URLs themselves.

import type {
  AuthResponse,
  JoinResponse,
  Meeting,
  MeetingDetail,
  Message,
  Participant,
  ScheduleMeetingInput,
  User,
} from "@/types/meeting";
import { getParticipantToken, getToken, saveParticipantToken } from "@/lib/auth";

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8000";

// The free backend host can take ~30-60 s to wake up after being idle, so the limit is generous,
// but a request can never hang forever: after this it fails with a clear message and a Retry button.
const REQUEST_TIMEOUT_MS = 75_000;

export class ApiError extends Error {
  constructor(message: string, public status: number) {
    super(message);
  }
}

async function request<T>(path: string, options: RequestInit = {}): Promise<T> {
  const headers: Record<string, string> = { ...(options.headers as Record<string, string>) };
  if (options.body) headers["Content-Type"] = "application/json";
  const token = getToken();
  if (token) headers["Authorization"] = `Bearer ${token}`; // tells the server who is signed in

  let response: Response;
  try {
    response = await fetch(`${API_URL}${path}`, { ...options, headers, signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS) });
  } catch (error) {
    if (error instanceof DOMException && error.name === "TimeoutError") {
      throw new ApiError("The server took too long to respond. Please try again.", 0);
    }
    throw new ApiError("Can't reach the server. Check your connection and try again.", 0);
  }

  if (!response.ok) {
    // The backend always sends { "detail": "readable message" } for errors.
    const body = await response.json().catch(() => null);
    const message = typeof body?.detail === "string" ? body.detail : "Something went wrong. Please try again.";
    throw new ApiError(message, response.status);
  }

  return response.status === 204 ? (undefined as T) : response.json();
}

const post = <T>(path: string, body: object = {}, headers: Record<string, string> = {}) =>
  request<T>(path, { method: "POST", body: JSON.stringify(body), headers });

/** Header proving which participant is acting (see saveParticipantToken in lib/auth.ts). */
const asParticipant = (participantId: number) => ({ "X-Participant-Token": getParticipantToken(participantId) ?? "" });

// ---------- Auth ----------

export const signUp = (name: string, email: string, password: string) =>
  post<AuthResponse>("/api/auth/signup", { name, email, password });
export const logIn = (email: string, password: string) => post<AuthResponse>("/api/auth/login", { email, password });
export const logOut = () => post<void>("/api/auth/logout");
export const getMe = () => request<User>("/api/auth/me");
export const updateProfile = (name: string) =>
  request<User>("/api/auth/me", { method: "PATCH", body: JSON.stringify({ name }) });

// ---------- Meetings ----------

export const getUpcomingMeetings = () => request<Meeting[]>("/api/meetings/upcoming");
export const getRecentMeetings = () => request<Meeting[]>("/api/meetings/recent");
export const getMeeting = (code: string) => request<MeetingDetail>(`/api/meetings/${code}`);
export const deleteMeeting = (code: string) => request<void>(`/api/meetings/${code}`, { method: "DELETE" });

export const createInstantMeeting = () => post<Meeting>("/api/meetings", { meeting_type: "instant" });

export const scheduleMeeting = (input: ScheduleMeetingInput) =>
  post<Meeting>("/api/meetings", { ...input, meeting_type: "scheduled" });

// ---------- Participants ----------

/** If the signed-in host joins their own meeting, the server makes them host. */
export async function joinMeeting(code: string, displayName: string, isMuted = true): Promise<JoinResponse> {
  const participant = await post<JoinResponse>(`/api/meetings/${code}/join`, { display_name: displayName, is_muted: isMuted });
  saveParticipantToken(participant.id, participant.token);
  return participant;
}

export const setMuted = (code: string, myId: number, isMuted: boolean) =>
  request<Participant>(`/api/meetings/${code}/participants/me`, {
    method: "PATCH",
    body: JSON.stringify({ is_muted: isMuted }),
    headers: asParticipant(myId),
  });

export const leaveMeeting = (code: string, myId: number) =>
  post<void>(`/api/meetings/${code}/participants/me/leave`, {}, asParticipant(myId));

export const sendMessage = (code: string, myId: number, text: string) =>
  post<Message>(`/api/meetings/${code}/messages`, { text }, asParticipant(myId));

// ---------- Host controls (the server checks that myId's token belongs to the host) ----------

export const endMeeting = (code: string, myId: number) => post<void>(`/api/meetings/${code}/end`, {}, asParticipant(myId));

export const muteAll = (code: string, myId: number) => post<void>(`/api/meetings/${code}/mute-all`, {}, asParticipant(myId));

export const removeParticipant = (code: string, participantId: number, myId: number) =>
  post<void>(`/api/meetings/${code}/participants/${participantId}/remove`, {}, asParticipant(myId));
