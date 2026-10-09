"use client";

import { useState } from "react";
import { Copy, Info, ShieldCheck, WifiOff } from "lucide-react";
import { formatMeetingCode } from "@/lib/meeting";
import type { MeetingDetail } from "@/types/meeting";

interface RoomHeaderProps {
  meeting: MeetingDetail;
  reconnecting: boolean; // the last refresh failed
  showInfoAtStart: boolean; // open the meeting info right after creating a meeting
  onCopyInvite: () => void;
}

/** Top bar of the meeting room: meeting title, and an (i) button with the Meeting ID and invite link. */
export function RoomHeader({ meeting, reconnecting, showInfoAtStart, onCopyInvite }: RoomHeaderProps) {
  const [showInfo, setShowInfo] = useState(showInfoAtStart);

  return (
    <header className="relative flex h-11 shrink-0 items-center gap-2 px-3">
      <ShieldCheck size={18} className="text-zoom-green" aria-label="Secure meeting" />
      <button
        type="button"
        onClick={() => setShowInfo((open) => !open)}
        aria-expanded={showInfo}
        aria-label="Meeting information"
        className="rounded-md p-1 text-white/80 hover:bg-room-hover hover:text-white"
      >
        <Info size={18} />
      </button>
      <h1 className="min-w-0 truncate text-sm font-medium text-white/90">{meeting.title}</h1>
      {reconnecting && (
        <span className="ml-auto flex items-center gap-1.5 rounded-md bg-[#5c1f1f] px-2 py-1 text-xs">
          <WifiOff size={14} /> Reconnecting…
        </span>
      )}

      {showInfo && (
        <div className="animate-pop-in absolute left-3 top-11 z-20 w-[min(22rem,calc(100vw-1.5rem))] rounded-xl bg-room-panel p-4 shadow-2xl ring-1 ring-white/10">
          <p className="font-semibold">{meeting.title}</p>
          <dl className="mt-3 grid grid-cols-[auto_1fr] gap-x-4 gap-y-1.5 text-sm">
            <dt className="text-white/55">Meeting ID</dt>
            <dd>{formatMeetingCode(meeting.meeting_code)}</dd>
            <dt className="text-white/55">Host</dt>
            <dd>{meeting.host_name}</dd>
            <dt className="text-white/55">Invite link</dt>
            <dd className="truncate text-[#7aa7ff]">{meeting.invite_link}</dd>
          </dl>
          <button
            type="button"
            onClick={onCopyInvite}
            className="mt-4 flex w-full items-center justify-center gap-2 rounded-lg bg-zoom-blue py-2 text-sm font-semibold hover:bg-zoom-blue-hover"
          >
            <Copy size={15} /> Copy invite link
          </button>
        </div>
      )}
    </header>
  );
}
