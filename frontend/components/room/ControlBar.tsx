"use client";

import { useState } from "react";
import { MessageSquare, Mic, MicOff, MonitorUp, Users, Video, VideoOff } from "lucide-react";

interface ControlBarProps {
  isMuted: boolean;
  isVideoOn: boolean;
  isSharing: boolean;
  isHost: boolean;
  participantCount: number;
  unreadMessages: number;
  onToggleMute: () => void;
  onToggleVideo: () => void;
  onToggleShare: () => void;
  onToggleParticipants: () => void;
  onToggleChat: () => void;
  onLeave: (endForAll: boolean) => void;
}

/** The bottom toolbar of the meeting room. */
export function ControlBar(props: ControlBarProps) {
  const [showLeaveMenu, setShowLeaveMenu] = useState(false);

  return (
    <footer className="relative grid h-[72px] shrink-0 grid-cols-[1fr_auto_1fr] items-center gap-1 bg-room px-2 sm:px-4">
      <div className="flex">
        <ControlButton label={props.isMuted ? "Unmute" : "Mute"} onClick={props.onToggleMute}>
          {props.isMuted ? <MicOff size={22} className="text-zoom-red" /> : <Mic size={22} />}
        </ControlButton>
        <ControlButton label={props.isVideoOn ? "Stop Video" : "Start Video"} onClick={props.onToggleVideo}>
          {props.isVideoOn ? <Video size={22} /> : <VideoOff size={22} className="text-zoom-red" />}
        </ControlButton>
      </div>

      <div className="flex">
        <ControlButton label="Participants" onClick={props.onToggleParticipants}>
          <span className="relative">
            <Users size={22} />
            <span className="absolute -right-3 -top-1.5 rounded-full bg-room-hover px-1 text-[10px] font-semibold leading-4">
              {props.participantCount}
            </span>
          </span>
        </ControlButton>
        <ControlButton label="Chat" onClick={props.onToggleChat}>
          <span className="relative">
            <MessageSquare size={22} />
            {props.unreadMessages > 0 && (
              <span className="absolute -right-2.5 -top-1.5 min-w-4 rounded-full bg-zoom-red px-1 text-center text-[10px] font-semibold leading-4">
                {props.unreadMessages}
              </span>
            )}
          </span>
        </ControlButton>
        <ControlButton label={props.isSharing ? "Stop Share" : "Share Screen"} onClick={props.onToggleShare}>
          <span className={`flex h-[26px] w-[30px] items-center justify-center rounded-md ${props.isSharing ? "bg-zoom-red" : "bg-[#0e8a3a]"}`}>
            <MonitorUp size={17} />
          </span>
        </ControlButton>
      </div>

      <div className="relative justify-self-end">
        <button
          type="button"
          onClick={() => setShowLeaveMenu((open) => !open)}
          aria-expanded={showLeaveMenu}
          className="rounded-lg bg-zoom-red px-4 py-2 text-sm font-semibold text-white hover:bg-[#c81f1f] sm:px-5"
        >
          {props.isHost ? "End" : "Leave"}
        </button>

        {showLeaveMenu && (
          <div className="animate-pop-in absolute bottom-14 right-0 z-20 w-64 space-y-2 rounded-xl bg-room-panel p-3 shadow-2xl ring-1 ring-white/10">
            {props.isHost && (
              <button
                type="button"
                onClick={() => props.onLeave(true)}
                className="w-full rounded-lg bg-zoom-red py-2 text-sm font-semibold text-white hover:bg-[#c81f1f]"
              >
                End Meeting for All
              </button>
            )}
            <button
              type="button"
              onClick={() => props.onLeave(false)}
              className={`w-full rounded-lg py-2 text-sm font-semibold text-white ${
                props.isHost ? "bg-room-hover hover:bg-[#4a4a4a]" : "bg-zoom-red hover:bg-[#c81f1f]"
              }`}
            >
              Leave Meeting
            </button>
            <button type="button" onClick={() => setShowLeaveMenu(false)} className="w-full py-1.5 text-sm text-white/70 hover:text-white">
              Cancel
            </button>
          </div>
        )}
      </div>
    </footer>
  );
}

function ControlButton({ label, onClick, children }: { label: string; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="flex min-w-[56px] flex-col items-center gap-1 whitespace-nowrap rounded-lg px-1.5 py-1.5 text-white transition-colors hover:bg-room-hover sm:min-w-[76px]"
    >
      <span className="flex h-[26px] items-center">{children}</span>
      <span className="text-[10px] text-white/85 sm:text-[11px]">{label}</span>
    </button>
  );
}
