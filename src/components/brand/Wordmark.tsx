import { cn } from "@/lib/cn";

/** A game tile seen from above: two nested squares turned 45 degrees and a single accent pip. */
export function BrandMark({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 40 40" className={cn("size-8", className)} aria-hidden>
      <rect x="8" y="8" width="24" height="24" transform="rotate(45 20 20)" fill="none" stroke="currentColor" strokeWidth="1.25" />
      <rect x="13" y="13" width="14" height="14" transform="rotate(45 20 20)" fill="none" stroke="currentColor" strokeOpacity="0.45" strokeWidth="1" />
      <circle cx="20" cy="20" r="2.25" fill="var(--color-accent)" />
    </svg>
  );
}

const sizes = {
  sm: { mark: "size-6", top: "text-[0.6rem] tracking-[0.32em]", cup: "text-lg" },
  md: { mark: "size-9", top: "text-[0.7rem] tracking-[0.34em]", cup: "text-3xl" },
  lg: { mark: "size-14", top: "text-sm tracking-[0.4em]", cup: "text-6xl md:text-7xl" },
};

export function Wordmark({ size = "md", subtitle }: { size?: keyof typeof sizes; subtitle?: string }) {
  const s = sizes[size];
  return (
    <div className="flex items-center gap-3">
      <BrandMark className={cn(s.mark, "text-text")} />
      <div className="leading-none">
        <div className={cn("font-display uppercase text-muted", s.top)}>Board Games</div>
        <div className={cn("font-display font-semibold uppercase tracking-tight text-text", s.cup)}>
          Cup
          {subtitle ? <span className="ml-3 align-middle text-[0.4em] font-normal tracking-[0.3em] text-accent">{subtitle}</span> : null}
        </div>
      </div>
    </div>
  );
}
