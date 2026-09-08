"use client";

import { useEffect, useState } from "react";
import { Button, type ButtonProps } from "./Button";

/** Destructive actions need a second tap within 3 seconds; avoids modal dialogs mid-event. */
export function ConfirmButton({
  onConfirm,
  label,
  confirmLabel,
  variant = "danger",
  ...props
}: Omit<ButtonProps, "onClick" | "children"> & {
  onConfirm: () => void;
  label: React.ReactNode;
  confirmLabel: React.ReactNode;
}) {
  const [armed, setArmed] = useState(false);

  useEffect(() => {
    if (!armed) return;
    const id = setTimeout(() => setArmed(false), 3000);
    return () => clearTimeout(id);
  }, [armed]);

  return (
    <Button
      {...props}
      variant={armed ? "primary" : variant}
      className={armed ? "bg-down text-bg" : props.className}
      onClick={() => {
        if (armed) {
          setArmed(false);
          onConfirm();
        } else {
          setArmed(true);
        }
      }}
    >
      {armed ? confirmLabel : label}
    </Button>
  );
}
