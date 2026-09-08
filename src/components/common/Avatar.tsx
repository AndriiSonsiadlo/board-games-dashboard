import { initials } from "@/domain/players";
import { cn } from "@/lib/cn";

const sizes = { sm: "size-7 text-[10px]", md: "size-9 text-xs", lg: "size-14 text-base" };

export function Avatar({ name, color, size = "md" }: { name: string; color: string; size?: keyof typeof sizes }) {
  return (
    <span
      className={cn("inline-grid shrink-0 place-items-center rounded-full border font-display tracking-wide", sizes[size])}
      style={{ borderColor: color, color, backgroundColor: `color-mix(in oklab, ${color} 12%, transparent)` }}
      aria-hidden
    >
      {initials(name)}
    </span>
  );
}
