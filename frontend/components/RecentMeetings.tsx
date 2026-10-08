import { Clock, History, Users, Video } from "lucide-react";
import type { Meeting } from "@/types/meeting";
import { formatDayLabel, formatDuration, formatMeetingCode, formatTime } from "@/lib/meeting";
import { ErrorState, LoadingRows } from "@/components/UpcomingMeetings";

interface RecentMeetingsProps {
  meetings: Meeting[] | null;
  error: string | null;
  onRetry: () => void;
  onRejoin: (code: string) => void;
}

export function RecentMeetings({ meetings, error, onRetry, onRejoin }: RecentMeetingsProps) {
  return (
    <section aria-labelledby="recent-heading" className="rounded-2xl border border-line bg-white shadow-sm">
      <div className="flex items-center gap-2 border-b border-line px-6 py-4">
        <History size={18} className="text-ink-muted" />
        <h2 id="recent-heading" className="text-[15px] font-semibold">
          Recent meetings
        </h2>
      </div>

      {error ? (
        <ErrorState message={error} onRetry={onRetry} />
      ) : meetings === null ? (
        <LoadingRows count={4} />
      ) : meetings.length === 0 ? (
        <div className="px-6 py-10 text-center">
          <p className="text-sm font-medium">No recent meetings</p>
          <p className="mt-1 text-sm text-ink-muted">Meetings you’ve held will appear here.</p>
        </div>
      ) : (
        <ul className="divide-y divide-line">
          {meetings.map((meeting) => (
            <RecentRow key={meeting.meeting_code} meeting={meeting} onRejoin={onRejoin} />
          ))}
        </ul>
      )}
    </section>
  );
}

function RecentRow({ meeting, onRejoin }: { meeting: Meeting; onRejoin: (code: string) => void }) {
  const start = new Date(meeting.scheduled_at);
  // Show how long it actually lasted if the host ended it, otherwise the planned length.
  const minutes = meeting.ended_at
    ? Math.max(1, Math.round((new Date(meeting.ended_at).getTime() - start.getTime()) / 60_000))
    : meeting.duration_minutes;
  // "live" here means the time slot is over but the host never ended it.
  const label =
    meeting.status === "ended" ? "Ended" : meeting.status === "live" ? "In progress" : "Missed";

  return (
    <li className="flex flex-wrap items-center gap-x-4 gap-y-2 px-6 py-4 hover:bg-canvas/60">
      <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-zoom-blue-soft text-zoom-blue">
        <Video size={18} />
      </span>

      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-semibold">{meeting.title}</p>
        <p className="mt-0.5 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-ink-muted">
          <span>
            {formatDayLabel(start)}, {formatTime(start)}
          </span>
          <span className="flex items-center gap-1">
            <Clock size={12} /> {formatDuration(minutes)}
          </span>
          <span className="flex items-center gap-1">
            <Users size={12} /> {meeting.participant_count}{" "}
            {meeting.participant_count === 1 ? "participant" : "participants"}
          </span>
          <span>ID: {formatMeetingCode(meeting.meeting_code)}</span>
        </p>
      </div>

      {meeting.status === "live" ? (
        <button
          type="button"
          onClick={() => onRejoin(meeting.meeting_code)}
          className="btn-primary px-3"
        >
          Rejoin
        </button>
      ) : (
        <span
          className={`rounded-md px-2 py-1 text-xs font-medium ${
            label === "Missed" ? "bg-[#fff1e9] text-[#c2410c]" : "bg-canvas text-ink-muted"
          }`}
        >
          {label}
        </span>
      )}
    </li>
  );
}
