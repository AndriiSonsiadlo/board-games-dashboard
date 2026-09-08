"use client";

import { cn } from "@/lib/cn";

export function Switch({
  checked,
  onCheckedChange,
  label,
  disabled,
}: {
  checked: boolean;
  onCheckedChange: (checked: boolean) => void;
  label?: React.ReactNode;
  disabled?: boolean;
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      disabled={disabled}
      onClick={() => onCheckedChange(!checked)}
      className="flex min-h-11 items-center gap-3 text-left text-sm disabled:opacity-40"
    >
      <span
        className={cn(
          "relative h-6 w-10 shrink-0 rounded-full border transition-colors duration-200",
          checked ? "border-accent bg-accent/25" : "border-line-strong bg-surface-2",
        )}
      >
        <span
          className={cn(
            "absolute top-1/2 size-4 -translate-y-1/2 rounded-full transition-[left,background-color] duration-200",
            checked ? "left-[1.2rem] bg-accent" : "left-1 bg-muted",
          )}
        />
      </span>
      {label ? <span>{label}</span> : null}
    </button>
  );
}
