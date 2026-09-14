"use client";

import type { Heatmap as HeatmapData } from "@/domain/stats";
import { formatClock, pad2 } from "@/lib/format";

export function Heatmap({ data }: { data: HeatmapData }) {
  const columns = { gridTemplateColumns: `2.25rem repeat(${data.hours.length}, minmax(0, 1fr))` };
  const labelEvery = data.hours.length <= 6 ? 1 : 2;

  return (
    <div className="space-y-1">
      <div className="grid gap-1" style={columns}>
        <span />
        {data.hours.map((hour, i) => (
          <span key={hour} className="text-center font-mono text-[10px] text-muted" suppressHydrationWarning>
            {i % labelEvery === 0 ? formatClock(hour).slice(0, 2) : ""}
          </span>
        ))}
      </div>
      {data.rows.map((row) => (
        <div key={row.tableId} className="grid gap-1" style={columns}>
          <span className="font-display text-sm leading-7 text-muted tabular">{pad2(row.number)}</span>
          {row.cells.map((value, i) => (
            <span
              key={data.hours[i]}
              className="grid h-7 place-items-center rounded-sm border border-line font-mono text-[10px]"
              style={
                value > 0
                  ? { backgroundColor: `color-mix(in oklab, var(--color-accent) ${Math.round(15 + (70 * value) / data.max)}%, transparent)` }
                  : undefined
              }
            >
              {value > 0 ? value : ""}
            </span>
          ))}
        </div>
      ))}
    </div>
  );
}
