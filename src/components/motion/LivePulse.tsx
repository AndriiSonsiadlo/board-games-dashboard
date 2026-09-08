import { cn } from "@/lib/cn";

export function LivePulse({ className }: { className?: string }) {
  return (
    <span className={cn("relative inline-flex size-2", className)} aria-hidden>
      <span className="absolute inset-0 animate-live-pulse rounded-full bg-live" />
      <span className="relative inline-flex size-2 rounded-full bg-live" />
    </span>
  );
}
