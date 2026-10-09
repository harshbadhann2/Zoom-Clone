interface ActionTileProps {
  label: string;
  icon: React.ReactNode;
  onClick: () => void;
  color?: "orange" | "blue";
  disabled?: boolean;
}

/** The big rounded-square buttons from the Zoom home screen (New meeting, Join, Schedule, Share screen). */
export function ActionTile({ label, icon, onClick, color = "blue", disabled }: ActionTileProps) {
  const colors =
    color === "orange"
      ? "bg-zoom-orange hover:bg-zoom-orange-hover shadow-[0_8px_20px_-8px_rgba(255,116,46,0.7)]"
      : "bg-zoom-blue hover:bg-zoom-blue-hover shadow-[0_8px_20px_-8px_rgba(13,107,222,0.7)]";

  return (
    <button type="button" onClick={onClick} disabled={disabled} className="group flex flex-col items-center gap-2.5 disabled:cursor-wait">
      <span
        className={`flex h-20 w-20 items-center justify-center rounded-[22px] text-white transition-transform group-hover:-translate-y-0.5 group-active:translate-y-0 sm:h-[88px] sm:w-[88px] ${colors}`}
      >
        {icon}
      </span>
      <span className="text-[13px] font-medium text-ink">{label}</span>
    </button>
  );
}
