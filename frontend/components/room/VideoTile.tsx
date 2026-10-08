import { MicOff } from "lucide-react";
import { Avatar } from "@/components/Avatar";

interface VideoTileProps {
  name: string;
  isMuted: boolean;
  isMe?: boolean;
  /** Only the current user's own camera is real; everyone else shows their avatar. */
  stream?: MediaStream | null;
  compact?: boolean;
}

export function VideoTile({ name, isMuted, isMe = false, stream, compact = false }: VideoTileProps) {
  return (
    <div className="relative flex aspect-video w-full items-center justify-center overflow-hidden rounded-xl bg-room-tile">
      {stream ? (
        <video
          // Attach the camera stream to the <video> element (React has no prop for srcObject).
          ref={(video) => {
            if (video && video.srcObject !== stream) video.srcObject = stream;
          }}
          autoPlay
          muted
          playsInline
          className="h-full w-full -scale-x-100 object-cover" // mirrored, like a selfie preview
        />
      ) : (
        <Avatar name={name} size={compact ? 44 : 88} />
      )}

      <div className="absolute bottom-2 left-2 flex max-w-[calc(100%-1rem)] items-center gap-1.5 rounded-md bg-black/60 px-2 py-1 text-xs text-white">
        {isMuted && <MicOff size={13} className="shrink-0 text-zoom-red" aria-label="Muted" />}
        <span className="truncate">
          {name}
          {isMe && " (me)"}
        </span>
      </div>
    </div>
  );
}
