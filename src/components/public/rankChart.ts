const r1 = (n: number) => Math.round(n * 10) / 10;

export function rankChart(
  history: { rank: number | null }[],
  width: number,
  height: number,
  pad = 12,
): { path: string; points: { x: number; y: number; rank: number }[]; maxRank: number } {
  const ranks = history.flatMap((h) => (h.rank === null ? [] : [h.rank]));
  const maxRank = Math.max(1, ...ranks);
  const n = history.length;
  const innerW = width - pad * 2;
  const innerH = height - pad * 2;
  const points: { x: number; y: number; rank: number }[] = [];
  const parts: string[] = [];
  let penDown = false;

  history.forEach((h, i) => {
    if (h.rank === null) {
      penDown = false;
      return;
    }
    const x = r1(pad + (n === 1 ? innerW / 2 : (i * innerW) / (n - 1)));
    const y = r1(pad + (maxRank === 1 ? 0 : ((h.rank - 1) * innerH) / (maxRank - 1)));
    parts.push(`${penDown ? "L" : "M"}${x},${y}`);
    points.push({ x, y, rank: h.rank });
    penDown = true;
  });

  return { path: parts.join(" "), points, maxRank };
}
