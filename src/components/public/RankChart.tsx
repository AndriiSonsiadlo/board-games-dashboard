import { rankChart } from "./rankChart";

const W = 640;
const H = 200;

export function RankChart({ history }: { history: { rank: number | null }[] }) {
  const chart = rankChart(history, W, H, 16);
  const last = chart.points[chart.points.length - 1];
  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="h-auto w-full" aria-hidden>
      <line x1={16} x2={W - 16} y1={16} y2={16} stroke="var(--color-line-strong)" strokeWidth={1} />
      <line x1={16} x2={W - 16} y1={H - 16} y2={H - 16} stroke="var(--color-line)" strokeWidth={1} />
      <path d={chart.path} fill="none" stroke="var(--color-accent)" strokeWidth={2} strokeLinejoin="round" strokeLinecap="round" />
      {chart.points.map((p, i) => (
        <circle key={i} cx={p.x} cy={p.y} r={p === last ? 5 : 3} fill={p === last ? "var(--color-accent)" : "var(--color-bg)"} stroke="var(--color-accent)" strokeWidth={1.5} />
      ))}
      <text x={W - 16} y={12} textAnchor="end" className="fill-[var(--color-muted)] font-mono text-[11px]">
        1
      </text>
      <text x={W - 16} y={H - 2} textAnchor="end" className="fill-[var(--color-muted)] font-mono text-[11px]">
        {chart.maxRank}
      </text>
    </svg>
  );
}
