import { MicOff } from "lucide-react";

interface VideoTileProps {
  name: string;
  isMuted: boolean;
  isMe?: boolean;
  /** Only the current user's own camera is real; everyone else shows their name. */
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
        // Like Zoom: with the camera off, the tile simply shows the person's name.
        <span className={`max-w-[85%] truncate px-2 text-center font-medium text-white ${compact ? "text-sm" : "text-2xl sm:text-3xl"}`}>
          {name}
        </span>
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
