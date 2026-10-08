"use client";

// Opened from an invite link like https://<app>/join/6148385880.
// Shows the meeting details, asks for a display name, then enters the meeting room.

import { use, useEffect, useState, type FormEvent } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { CalendarDays, Loader2, MicOff, User, VideoOff } from "lucide-react";
import { Field, inputClass } from "@/components/JoinMeetingModal";
import { ApiError, getMeeting, joinMeeting } from "@/lib/api";
import { formatDayLabel, formatMeetingCode, meetingTimeRange, parseMeetingInput } from "@/lib/meeting";
import type { MeetingDetail } from "@/types/meeting";

export default function JoinPage({ params }: { params: Promise<{ meetingCode: string }> }) {
  const { meetingCode: rawCode } = use(params);
  const meetingCode = parseMeetingInput(rawCode); // null if the link is malformed
  const router = useRouter();

  const [meeting, setMeeting] = useState<MeetingDetail | null>(null);
  const [loadError, setLoadError] = useState<ApiError | null>(null);
  const [name, setName] = useState("");
  const [nameError, setNameError] = useState<string | null>(null);
  const [joinError, setJoinError] = useState<string | null>(null);
  const [joining, setJoining] = useState(false);

  useEffect(() => {
    if (!meetingCode) return;
    getMeeting(meetingCode)
      .then(setMeeting)
      .catch((error: ApiError) => setLoadError(error));
  }, [meetingCode]);

  async function handleJoin(event: FormEvent) {
    event.preventDefault();
    if (!meetingCode) return;
    if (!name.trim()) return setNameError("Enter your name to join.");
    setNameError(null);
    setJoining(true);
    try {
      const participant = await joinMeeting(meetingCode, name.trim());
      router.push(`/meeting/${meetingCode}?pid=${participant.id}`);
    } catch (error) {
      setJoinError((error as Error).message);
      setJoining(false);
    }
  }

  // ---------- Error / loading states ----------
  if (!meetingCode) {
    return <JoinMessage title="Invalid invite link" text="This link doesn’t contain a valid 10-digit Meeting ID." />;
  }
  if (loadError?.status === 404) {
    return <JoinMessage title="Meeting not found" text={`No meeting exists with ID ${formatMeetingCode(meetingCode)}. Check the link with the host.`} />;
  }
  if (loadError) return <JoinMessage title="Couldn’t load the meeting" text={loadError.message} />;
  if (!meeting) {
    return (
      <JoinShell>
        <div className="flex justify-center py-20">
          <Loader2 size={28} className="animate-spin text-ink-muted" />
        </div>
      </JoinShell>
    );
  }
  if (meeting.status === "ended") {
    return <JoinMessage title="This meeting has ended" text={`“${meeting.title}” was ended by the host.`} />;
  }

  // ---------- Pre-join screen ----------
  return (
    <JoinShell>
      <div className="grid gap-8 md:grid-cols-[1.2fr_1fr] md:items-center">
        {/* Preview tile: you'll enter muted with video off */}
        <div className="relative flex aspect-video items-center justify-center rounded-2xl bg-[#323337]">
          <span className="flex h-[38%] aspect-[7/6] items-center justify-center rounded-[22%] bg-[#4a4b4f] text-[#323337]">
            <User className="h-3/4 w-3/4" fill="currentColor" strokeWidth={0} aria-hidden="true" />
          </span>
          <div className="absolute bottom-3 left-1/2 flex -translate-x-1/2 gap-2">
            <span className="flex items-center gap-1.5 rounded-lg bg-black/50 px-2.5 py-1.5 text-xs text-white">
              <MicOff size={14} className="text-zoom-red" /> Muted
            </span>
            <span className="flex items-center gap-1.5 rounded-lg bg-black/50 px-2.5 py-1.5 text-xs text-white">
              <VideoOff size={14} className="text-zoom-red" /> Video off
            </span>
          </div>
        </div>

        <form onSubmit={handleJoin} noValidate className="space-y-4">
          <div>
            <h1 className="text-xl font-semibold">{meeting.title}</h1>
            <p className="mt-1 flex items-center gap-1.5 text-sm text-ink-muted">
              <CalendarDays size={14} />
              {formatDayLabel(new Date(meeting.scheduled_at))} · {meetingTimeRange(meeting)}
            </p>
            <p className="mt-0.5 text-sm text-ink-muted">
              Hosted by {meeting.host_name} · ID {formatMeetingCode(meeting.meeting_code)}
            </p>
            {meeting.status === "live" && (
              <p className="mt-2 inline-block rounded bg-zoom-green/15 px-2 py-0.5 text-xs font-semibold text-[#0e8a3a]">
                In progress · {meeting.active_participants.length} in meeting
              </p>
            )}
          </div>

          <Field label="Your name" htmlFor="name" error={nameError ?? undefined}>
            <input
              id="name"
              autoFocus
              value={name}
              maxLength={100}
              onChange={(e) => setName(e.target.value)}
              placeholder="Enter your name"
              aria-invalid={Boolean(nameError)}
              className={inputClass(nameError ?? undefined)}
            />
          </Field>

          {joinError && (
            <p role="alert" className="rounded-lg bg-[#fdecec] px-3 py-2 text-sm text-zoom-red">
              {joinError}
            </p>
          )}

          <button
            type="submit"
            disabled={joining}
            className="flex w-full items-center justify-center rounded-lg bg-zoom-blue py-2.5 text-sm font-semibold text-white hover:bg-zoom-blue-hover disabled:opacity-60"
          >
            {joining ? <Loader2 size={16} className="animate-spin" /> : "Join"}
          </button>
        </form>
      </div>
    </JoinShell>
  );
}

function JoinShell({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex min-h-screen flex-col">
      <header className="border-b border-line bg-white">
        <div className="mx-auto flex h-16 max-w-5xl items-center px-4 sm:px-6">
          <Link href="/" className="text-[19px] font-bold tracking-tight text-zoom-blue">
            zoom <span className="font-medium text-ink-muted">clone</span>
          </Link>
        </div>
      </header>
      <main className="mx-auto flex w-full max-w-5xl flex-1 items-center px-4 py-10 sm:px-6">
        <div className="w-full rounded-2xl border border-line bg-white p-6 shadow-sm sm:p-8">{children}</div>
      </main>
    </div>
  );
}

function JoinMessage({ title, text }: { title: string; text: string }) {
  return (
    <JoinShell>
      <div className="py-10 text-center">
        <h1 className="text-xl font-semibold">{title}</h1>
        <p className="mt-2 text-sm text-ink-muted">{text}</p>
        <Link href="/" className="mt-6 inline-block rounded-lg bg-zoom-blue px-5 py-2 text-sm font-semibold text-white hover:bg-zoom-blue-hover">
          Back to home
        </Link>
      </div>
    </JoinShell>
  );
}
