"use client";

import { useTransition } from "react";
import { useI18n } from "@/i18n/LangProvider";
import type { ActionResult } from "@/lib/action";
import { handleResult } from "@/lib/notify";
import { useAdminLive } from "../live/LiveProvider";

export function useRunner() {
  const { t } = useI18n();
  const { refresh } = useAdminLive();
  const [pending, startTransition] = useTransition();

  function run<T>(action: () => Promise<ActionResult<T>>, opts: { success?: string; onOk?: (data: T) => void } = {}) {
    startTransition(async () => {
      const result = await action();
      if (handleResult(result, t, opts.success)) opts.onOk?.(result.data);
      refresh();
    });
  }

  return { run, pending };
}
