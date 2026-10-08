"use client";

import { useEffect, useRef, useState, type FormEvent } from "react";
import { SendHorizontal, X } from "lucide-react";
import { formatTime } from "@/lib/meeting";
import type { Message } from "@/types/meeting";

interface ChatPanelProps {
  messages: Message[];
  myId: number;
  onSend: (text: string) => Promise<void>;
  onClose: () => void;
}

/** In-meeting chat. New messages arrive through the room's regular refresh (every 3 seconds). */
export function ChatPanel({ messages, myId, onSend, onClose }: ChatPanelProps) {
  const [draft, setDraft] = useState("");
  const [sending, setSending] = useState(false);
  const listRef = useRef<HTMLDivElement>(null);

  // Keep the newest message in view.
  useEffect(() => {
    listRef.current?.scrollTo({ top: listRef.current.scrollHeight });
  }, [messages.length]);

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    const text = draft.trim();
    if (!text || sending) return;
    setSending(true);
    try {
      await onSend(text);
      setDraft("");
    } finally {
      setSending(false);
    }
  }

  return (
    <aside
      aria-label="Meeting chat"
      className="fixed inset-0 z-30 flex flex-col bg-room-panel text-white md:static md:z-auto md:w-80 md:shrink-0 md:border-l md:border-white/10"
    >
      <div className="flex items-center justify-between border-b border-white/10 px-4 py-3">
        <h2 className="text-sm font-semibold">Meeting Chat</h2>
        <button type="button" onClick={onClose} aria-label="Close chat" className="rounded-md p-1 text-white/70 hover:bg-room-hover hover:text-white">
          <X size={18} />
        </button>
      </div>

      <div ref={listRef} className="flex-1 space-y-4 overflow-y-auto px-4 py-4">
        {messages.length === 0 ? (
          <p className="pt-10 text-center text-sm text-white/50">Messages you send here are visible to everyone in the meeting.</p>
        ) : (
          messages.map((message) => {
            const mine = message.participant_id === myId;
            return (
              <div key={message.id} className={mine ? "text-right" : ""}>
                <p className="text-xs text-white/55">
                  {mine ? "You" : message.sender_name} · {formatTime(new Date(message.sent_at))}
                </p>
                <p
                  className={`mt-1 inline-block max-w-[85%] whitespace-pre-wrap break-words rounded-xl px-3 py-2 text-left text-sm ${
                    mine ? "bg-zoom-blue" : "bg-room-hover"
                  }`}
                >
                  {message.text}
                </p>
              </div>
            );
          })
        )}
      </div>

      <form onSubmit={handleSubmit} className="flex items-center gap-2 border-t border-white/10 p-3">
        <label htmlFor="chat-input" className="sr-only">
          Message everyone
        </label>
        <input
          id="chat-input"
          value={draft}
          maxLength={1000}
          onChange={(e) => setDraft(e.target.value)}
          placeholder="Message everyone"
          autoComplete="off"
          className="h-10 min-w-0 flex-1 rounded-xl border border-white/15 bg-room px-3 text-sm outline-none placeholder:text-white/40 focus:border-zoom-blue"
        />
        <button
          type="submit"
          disabled={!draft.trim() || sending}
          aria-label="Send message"
          className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-zoom-blue hover:bg-zoom-blue-hover disabled:bg-room-hover disabled:text-white/40"
        >
          <SendHorizontal size={18} />
        </button>
      </form>
    </aside>
  );
}
