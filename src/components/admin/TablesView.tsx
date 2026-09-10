"use client";

import { Plus, Trash } from "lucide-react";
import { useState, type FormEvent } from "react";
import { toast } from "sonner";
import { addTableAction, removeTableAction, updateTableAction } from "@/app/admin/actions";
import type { TableFact } from "@/domain/types";
import { useI18n } from "@/i18n/LangProvider";
import { cn } from "@/lib/cn";
import { pad2 } from "@/lib/format";
import { useAdminLive } from "../live/LiveProvider";
import { Button } from "../ui/Button";
import { ConfirmButton } from "../ui/ConfirmButton";
import { Switch } from "../ui/Switch";
import { useRunner } from "./useRunner";

const inputClass =
  "h-11 w-full rounded-md border border-line bg-surface-2 px-3 text-sm outline-none placeholder:text-muted focus:border-line-strong";

export function TablesView() {
  const { t } = useI18n();
  const { snapshot } = useAdminLive();
  const { run, pending } = useRunner();
  const [label, setLabel] = useState("");

  const add = (e: FormEvent) => {
    e.preventDefault();
    run(() => addTableAction(label.trim() || null), { onOk: () => setLabel("") });
  };

  return (
    <div className="space-y-6">
      <h1 className="font-display text-3xl uppercase tracking-tight md:text-4xl">{t.tables.title}</h1>

      <form onSubmit={add} className="flex gap-2">
        <input value={label} onChange={(e) => setLabel(e.target.value)} placeholder={t.tables.labelPlaceholder} className={inputClass} />
        <Button type="submit" variant="primary" loading={pending} className="shrink-0">
          <Plus className="size-4" />
          {t.tables.add}
        </Button>
      </form>

      <ul className="divide-y divide-line border-y border-line">
        {snapshot.allTables.map((table) => (
          <TableEditor key={`${table.id}-${snapshot.version}`} table={table} />
        ))}
      </ul>
    </div>
  );
}

function TableEditor({ table }: { table: TableFact }) {
  const { t } = useI18n();
  const { run, pending } = useRunner();
  const [label, setLabel] = useState(table.label ?? "");

  const saveLabel = () => {
    if ((table.label ?? "") !== label.trim()) run(() => updateTableAction(table.id, { label: label.trim() || null }));
  };

  return (
    <li className={cn("flex flex-wrap items-center gap-3 py-3", !table.active && "opacity-50")}>
      <span className="w-12 font-display text-3xl leading-none tabular">{pad2(table.number)}</span>
      <input
        value={label}
        onChange={(e) => setLabel(e.target.value)}
        onBlur={saveLabel}
        onKeyDown={(e) => {
          if (e.key === "Enter") e.currentTarget.blur();
        }}
        placeholder={t.tables.labelPlaceholder}
        className={cn(inputClass, "min-w-40 flex-1")}
      />
      <Switch
        checked={table.active}
        onCheckedChange={(active) => run(() => updateTableAction(table.id, { active }))}
        label={table.active ? t.tables.active : t.tables.inactive}
        disabled={pending}
      />
      <ConfirmButton
        size="sm"
        variant="ghost"
        disabled={pending}
        label={
          <>
            <Trash className="size-3.5" />
            {t.tables.remove}
          </>
        }
        confirmLabel={t.common.tapToConfirm}
        onConfirm={() =>
          run(() => removeTableAction(table.id), {
            onOk: (outcome) => toast.success(outcome === "deleted" ? t.tables.removed : t.tables.deactivated),
          })
        }
      />
    </li>
  );
}
