"use client";

import { Toaster as Sonner } from "sonner";

export function Toaster() {
  return (
    <Sonner
      theme="dark"
      position="top-center"
      offset={16}
      toastOptions={{
        classNames: {
          toast: "!rounded-md !border !border-line-strong !bg-surface-2 !text-text !font-sans",
          description: "!text-muted",
          actionButton: "!bg-accent !text-bg !font-display !uppercase",
          cancelButton: "!bg-transparent !text-muted",
        },
      }}
    />
  );
}
