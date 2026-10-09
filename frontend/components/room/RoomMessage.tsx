import Link from "next/link";
import { Loader2 } from "lucide-react";

interface RoomMessageProps {
  title: string;
  text?: string;
  spinner?: boolean; // loading states show a spinner instead of buttons
  joinCode?: string; // adds a "Join meeting" button for this meeting
}

/** Full-screen dark message used instead of the room: loading, errors, "meeting ended", "removed". */
export function RoomMessage({ title, text, spinner, joinCode }: RoomMessageProps) {
  return (
    <main className="flex h-dvh flex-col items-center justify-center bg-room px-6 text-center text-white">
      {spinner && <Loader2 size={32} className="mb-4 animate-spin text-white/70" />}
      <h1 className="text-xl font-semibold">{title}</h1>
      {text && <p className="mt-2 max-w-md text-sm text-white/65">{text}</p>}
      {!spinner && (
        <div className="mt-6 flex gap-2">
          {joinCode && (
            <Link href={`/join/${joinCode}`} className="rounded-lg bg-zoom-blue px-4 py-2 text-sm font-semibold hover:bg-zoom-blue-hover">
              Join meeting
            </Link>
          )}
          <Link href="/" className="rounded-lg bg-room-hover px-4 py-2 text-sm font-semibold hover:bg-[#4a4a4a]">
            Back to home
          </Link>
        </div>
      )}
    </main>
  );
}
