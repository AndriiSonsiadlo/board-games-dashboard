"use client";

import { X } from "lucide-react";
import { Dialog } from "radix-ui";

export function Sheet({
  open,
  onOpenChange,
  title,
  footer,
  children,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  footer?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <Dialog.Root open={open} onOpenChange={onOpenChange}>
      <Dialog.Portal>
        <Dialog.Overlay className="animate-overlay-in fixed inset-0 z-40 bg-black/70" />
        <Dialog.Content className="animate-sheet-in fixed inset-x-0 bottom-0 z-50 flex max-h-[92dvh] flex-col rounded-t-lg border-t border-line-strong bg-surface shadow-[0_-24px_80px_rgba(0,0,0,0.6)] outline-none md:inset-y-0 md:left-auto md:right-0 md:max-h-none md:w-[480px] md:rounded-none md:border-l md:border-t-0">
          <div className="flex items-center justify-between border-b border-line px-5 py-4">
            <Dialog.Title className="font-display text-lg uppercase tracking-[0.06em]">{title}</Dialog.Title>
            <Dialog.Description className="sr-only">{title}</Dialog.Description>
            <Dialog.Close className="-mr-2 grid size-10 place-items-center rounded-md text-muted hover:text-text" aria-label="Close">
              <X className="size-5" strokeWidth={1.5} />
            </Dialog.Close>
          </div>
          <div className="min-h-0 flex-1 overflow-y-auto px-5 py-4">{children}</div>
          {footer ? (
            <div className="border-t border-line px-5 pt-3 pb-[max(0.75rem,env(safe-area-inset-bottom))]">{footer}</div>
          ) : null}
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
