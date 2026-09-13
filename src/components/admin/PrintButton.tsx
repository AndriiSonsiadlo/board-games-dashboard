"use client";

import { Printer } from "lucide-react";

export function PrintButton({ label }: { label: string }) {
  return (
    <button
      type="button"
      onClick={() => window.print()}
      className="inline-flex h-11 items-center gap-2 rounded-md bg-black px-5 font-display text-sm uppercase tracking-[0.08em] text-white"
    >
      <Printer className="size-4" />
      {label}
    </button>
  );
}
