"use client";

import { useEffect } from "react";

// global-error replaces the root layout, so it must define its own <html>/<body>
// and cannot rely on globals.css, fonts or Tailwind classes reaching it.
export default function GlobalError({
  error,
  retry,
}: {
  error: Error & { digest?: string };
  retry: () => void;
}) {
  useEffect(() => {
    console.error("app global error boundary", error);
  }, [error]);

  return (
    <html lang="en">
      <body
        style={{
          margin: 0,
          minHeight: "100dvh",
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          justifyContent: "center",
          gap: "1rem",
          padding: "1.5rem",
          textAlign: "center",
          fontFamily: "system-ui, sans-serif",
          background: "#0b0b0c",
          color: "#f2f2f0",
        }}
      >
        <h1 style={{ fontSize: "1.5rem", margin: 0 }}>Something went wrong</h1>
        <p style={{ maxWidth: "24rem", color: "#a3a3a3", margin: 0 }}>
          An unexpected error occurred. Reloading usually fixes it.
        </p>
        <button
          type="button"
          onClick={() => retry()}
          style={{
            height: "2.75rem",
            padding: "0 1.5rem",
            borderRadius: "0.375rem",
            border: "none",
            background: "#c9a45c",
            color: "#0b0b0c",
            fontWeight: 600,
            cursor: "pointer",
          }}
        >
          Reload
        </button>
      </body>
    </html>
  );
}
