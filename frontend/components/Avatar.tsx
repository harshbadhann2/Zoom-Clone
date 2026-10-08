import { initials } from "@/lib/meeting";

const COLORS = ["#0b5cff", "#ff742e", "#7c3aed", "#0e9f6e", "#e11d48", "#0891b2", "#ca8a04"];

/** Rounded-square initials avatar. The same name always gets the same color. */
export function Avatar({ name, size = 36 }: { name: string; size?: number }) {
  const colorIndex = [...name].reduce((sum, char) => sum + char.charCodeAt(0), 0) % COLORS.length;

  return (
    <span
      aria-hidden="true"
      className="inline-flex shrink-0 select-none items-center justify-center rounded-[30%] font-semibold text-white"
      style={{ width: size, height: size, fontSize: size * 0.38, background: COLORS[colorIndex] }}
    >
      {initials(name)}
    </span>
  );
}
