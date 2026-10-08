import { Mic, MicOff, X } from "lucide-react";
import { Avatar } from "@/components/Avatar";
import type { Participant } from "@/types/meeting";

interface ParticipantsPanelProps {
  participants: Participant[];
  myId: number;
  isHost: boolean;
  onClose: () => void;
  onInvite: () => void;
  onMuteAll: () => void;
  onRemove: (participant: Participant) => void;
}

export function ParticipantsPanel({ participants, myId, isHost, onClose, onInvite, onMuteAll, onRemove }: ParticipantsPanelProps) {
  return (
    // Full-screen overlay on phones, a side panel on larger screens.
    <aside
      aria-label="Participants"
      className="fixed inset-0 z-30 flex flex-col bg-room-panel text-white md:static md:z-auto md:w-80 md:shrink-0 md:border-l md:border-white/10"
    >
      <div className="flex items-center justify-between border-b border-white/10 px-4 py-3">
        <h2 className="text-sm font-semibold">Participants ({participants.length})</h2>
        <button type="button" onClick={onClose} aria-label="Close participants" className="rounded-md p-1 text-white/70 hover:bg-room-hover hover:text-white">
          <X size={18} />
        </button>
      </div>

      <ul className="flex-1 overflow-y-auto py-2">
        {participants.map((person) => {
          const tags = [person.is_host && "Host", person.id === myId && "me"].filter(Boolean).join(", ");
          return (
            <li key={person.id} className="group flex items-center gap-3 px-4 py-2 hover:bg-room-hover/60">
              <Avatar name={person.display_name} size={32} />
              <p className="min-w-0 flex-1 truncate text-sm">
                {person.display_name}
                {tags && <span className="text-white/55"> ({tags})</span>}
              </p>
              {isHost && !person.is_host && (
                <button
                  type="button"
                  onClick={() => onRemove(person)}
                  className="rounded-md bg-room-hover px-2 py-1 text-xs font-medium hover:bg-zoom-red md:opacity-0 md:focus-visible:opacity-100 md:group-hover:opacity-100"
                >
                  Remove
                </button>
              )}
              {person.is_muted ? (
                <MicOff size={16} className="shrink-0 text-zoom-red" aria-label="Muted" />
              ) : (
                <Mic size={16} className="shrink-0 text-white/80" aria-label="Unmuted" />
              )}
            </li>
          );
        })}
      </ul>

      <div className="flex gap-2 border-t border-white/10 p-3">
        <button type="button" onClick={onInvite} className="flex-1 rounded-lg bg-room-hover py-2 text-sm font-medium hover:bg-[#4a4a4a]">
          Invite
        </button>
        {isHost && (
          <button type="button" onClick={onMuteAll} className="flex-1 rounded-lg bg-room-hover py-2 text-sm font-medium hover:bg-[#4a4a4a]">
            Mute All
          </button>
        )}
      </div>
    </aside>
  );
}
