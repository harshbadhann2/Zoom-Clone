/**
 * Arranges the participant tiles.
 * - Normally: a grid that gets more columns as more people join.
 * - While you share your screen: the shared screen large, the tiles in a strip beside it.
 */
export function VideoGrid({ tiles, screenStream }: { tiles: React.ReactElement[]; screenStream: MediaStream | null }) {
  if (screenStream) {
    return (
      <div className="flex min-h-0 w-full flex-col gap-2 lg:flex-row">
        <video
          ref={(video) => {
            if (video && video.srcObject !== screenStream) video.srcObject = screenStream;
          }}
          autoPlay
          muted
          playsInline
          className="min-h-0 min-w-0 flex-1 rounded-xl bg-black object-contain"
        />
        <div className="flex shrink-0 gap-2 overflow-auto lg:w-56 lg:flex-col">
          {tiles.map((tile) => (
            <div key={tile.key} className="w-40 shrink-0 lg:w-full">
              {tile}
            </div>
          ))}
        </div>
      </div>
    );
  }

  const columns =
    tiles.length === 1 ? "max-w-4xl grid-cols-1" : tiles.length <= 4 ? "max-w-6xl grid-cols-1 sm:grid-cols-2" : "max-w-7xl grid-cols-2 lg:grid-cols-3";
  return (
    <div className="flex w-full items-center justify-center overflow-y-auto">
      <div className={`grid w-full gap-2 ${columns}`}>{tiles}</div>
    </div>
  );
}
