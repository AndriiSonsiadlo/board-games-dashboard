import type { RaceSeries } from "@/domain/stats";
import { rankChart } from "./rankChart";

const W = 640;
const H = 240;
const PAD = 16;

/** Rank after every result for the final top players; the champion is drawn last, in the accent color. */
export function RaceChart({ race, colorOf }: { race: RaceSeries[]; colorOf: (playerId: number) => string }) {
  const maxRank = Math.max(1, ...race.flatMap((s) => s.ranks.flatMap((r) => (r === null ? [] : [r]))));
  const leaderId = race[0]?.playerId;

  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="h-auto w-full" aria-hidden>
      <line x1={PAD} x2={W - PAD} y1={PAD} y2={PAD} stroke="var(--color-line-strong)" strokeWidth={1} />
      <line x1={PAD} x2={W - PAD} y1={H - PAD} y2={H - PAD} stroke="var(--color-line)" strokeWidth={1} />
      {[...race].reverse().map((series) => {
        const chart = rankChart(series.ranks.map((rank) => ({ rank })), W, H, PAD, maxRank);
        const leader = series.playerId === leaderId;
        return (
          <path
            key={series.playerId}
            d={chart.path}
            fill="none"
            stroke={leader ? "var(--color-accent)" : colorOf(series.playerId)}
            strokeWidth={leader ? 3 : 1.5}
            strokeLinejoin="round"
            strokeLinecap="round"
          />
        );
      })}
      <text x={W - PAD} y={12} textAnchor="end" className="fill-[var(--color-muted)] font-mono text-[11px]">
        1
      </text>
      <text x={W - PAD} y={H - 2} textAnchor="end" className="fill-[var(--color-muted)] font-mono text-[11px]">
        {maxRank}
      </text>
    </svg>
  );
}
