"use client";

import { useEffect } from "react";
import { Button } from "@/components/ui/Button";

export default function Error({
  error,
  retry,
}: {
  error: Error & { digest?: string };
  retry: () => void;
}) {
  useEffect(() => {
    console.error("app error boundary", error);
  }, [error]);

  return (
    <div className="flex min-h-[70dvh] flex-col items-center justify-center gap-4 px-6 text-center">
      <h1 className="font-display text-2xl uppercase tracking-tight">Something went wrong</h1>
      <p className="max-w-sm text-sm text-muted">
        An unexpected error occurred. Reloading usually fixes it.
      </p>
      <Button variant="primary" onClick={() => retry()}>
        Reload
      </Button>
    </div>
  );
}
