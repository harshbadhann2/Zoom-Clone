"use client";

import { CalendarPlus, Copy, Loader2, Trash2 } from "lucide-react";
import type { Meeting } from "@/types/meeting";
import { useCurrentTime } from "@/lib/useCurrentTime";
import { formatDayLabel, formatMeetingCode, formatTime, meetingTimeRange } from "@/lib/meeting";

interface UpcomingMeetingsProps {
  meetings: Meeting[] | null; // null = still loading
  error: string | null;
  startingCode: string | null;
  onStart: (code: string) => void;
  onCopyInvitation: (meeting: Meeting) => void;
  onDelete: (meeting: Meeting) => void;
  onSchedule: () => void;
  onRetry: () => void;
}

/** Right-hand card on the dashboard: live clock on top, upcoming meetings below. */
export function UpcomingMeetings(props: UpcomingMeetingsProps) {
  const { meetings, error } = props;
  const now = useCurrentTime();

  return (
    <section aria-labelledby="upcoming-heading" className="overflow-hidden rounded-2xl border border-line bg-white shadow-sm">
      <div className="relative overflow-hidden bg-[linear-gradient(135deg,#0d6bde_0%,#3d86ea_55%,#7fb0f2_100%)] px-6 py-7 text-white">
        {/* soft decorative circles */}
        <div className="absolute -right-10 -top-16 h-48 w-48 rounded-full bg-white/10" />
        <div className="absolute -bottom-20 right-16 h-40 w-40 rounded-full bg-white/10" />
        {/* "\u00a0" keeps the height steady for the split second before the clock is read */}
        <p className="relative text-4xl font-semibold tracking-tight sm:text-5xl">{now ? formatTime(now) : "\u00a0"}</p>
        <p className="relative mt-1 text-sm text-white/85">
          {now ? now.toLocaleDateString([], { weekday: "long", month: "long", day: "numeric", year: "numeric" }) : "\u00a0"}
        </p>
      </div>

      <div className="flex items-center justify-between px-6 pb-2 pt-5">
        <h2 id="upcoming-heading" className="text-[15px] font-semibold">
          Upcoming meetings
        </h2>
        {meetings && meetings.length > 0 && (
          <span className="text-xs font-medium text-ink-muted">{meetings.length} scheduled</span>
        )}
      </div>

      <div className="px-3 pb-3 lg:max-h-[440px] lg:overflow-y-auto">
        {error ? (
          <ErrorState message={error} onRetry={props.onRetry} />
        ) : meetings === null ? (
          <LoadingRows />
        ) : meetings.length === 0 ? (
          <div className="flex flex-col items-center px-6 py-10 text-center">
            <CalendarPlus size={36} className="text-ink-muted/60" />
            <p className="mt-3 text-sm font-medium">No upcoming meetings</p>
            <p className="mt-1 text-sm text-ink-muted">Schedule one and it will show up here.</p>
            <button type="button" onClick={props.onSchedule} className="mt-4 text-sm font-semibold text-zoom-blue hover:underline">
              Schedule a meeting
            </button>
          </div>
        ) : (
          <ul>
            {meetings.map((meeting) => (
              <UpcomingRow key={meeting.meeting_code} meeting={meeting} {...props} />
            ))}
          </ul>
        )}
      </div>
    </section>
  );
}

function UpcomingRow({ meeting, startingCode, onStart, onCopyInvitation, onDelete }: { meeting: Meeting } & UpcomingMeetingsProps) {
  const isLive = meeting.status === "live";
  const isStarting = startingCode === meeting.meeting_code;

  return (
    <li className="group flex items-center gap-3 rounded-xl px-3 py-3 hover:bg-canvas">
      <div className="min-w-0 flex-1">
        <p className="flex items-center gap-2 text-xs text-ink-muted">
          {isLive && <span className="rounded bg-zoom-green/15 px-1.5 py-0.5 text-[11px] font-semibold text-[#0a6b2c]">Live</span>}
          {formatDayLabel(new Date(meeting.scheduled_at))} · {meetingTimeRange(meeting)}
        </p>
        <button
          type="button"
          onClick={() => onStart(meeting.meeting_code)}
          className="mt-0.5 block max-w-full truncate py-0.5 text-left text-sm font-semibold hover:text-zoom-blue"
        >
          {meeting.title}
        </button>
        <p className="mt-0.5 text-xs text-ink-muted">Meeting ID: {formatMeetingCode(meeting.meeting_code)}</p>
      </div>

      <div className="flex shrink-0 items-center gap-1">
        <IconButton label="Copy invitation" onClick={() => onCopyInvitation(meeting)}>
          <Copy size={16} />
        </IconButton>
        {!isLive && (
          <IconButton label="Delete meeting" onClick={() => onDelete(meeting)}>
            <Trash2 size={16} />
          </IconButton>
        )}
        <button
          type="button"
          onClick={() => onStart(meeting.meeting_code)}
          disabled={startingCode !== null}
          className="btn-primary ml-1 min-w-16 px-3"
        >
          {isStarting ? <Loader2 size={16} className="animate-spin" /> : isLive ? "Join" : "Start"}
        </button>
      </div>
    </li>
  );
}

function IconButton({ label, onClick, children }: { label: string; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      type="button"
      aria-label={label}
      title={label}
      onClick={onClick}
      className="rounded-lg p-2 text-ink-muted transition-colors hover:bg-white hover:text-ink sm:opacity-0 sm:focus-visible:opacity-100 sm:group-hover:opacity-100"
    >
      {children}
    </button>
  );
}

export function LoadingRows({ count = 3 }: { count?: number }) {
  return (
    <div role="status" aria-label="Loading meetings" className="space-y-2 p-3">
      {Array.from({ length: count }, (_, i) => (
        <div key={i} className="animate-pulse space-y-2 py-2">
          <div className="h-3 w-32 rounded bg-line" />
          <div className="h-4 w-48 rounded bg-line" />
        </div>
      ))}
    </div>
  );
}

export function ErrorState({ message, onRetry }: { message: string; onRetry: () => void }) {
  return (
    <div className="flex flex-col items-center px-6 py-10 text-center">
      <p className="text-sm font-medium">Couldn’t load meetings</p>
      <p className="mt-1 text-sm text-ink-muted">{message}</p>
      <button type="button" onClick={onRetry} className="btn-secondary mt-4">
        Try again
      </button>
    </div>
  );
}
