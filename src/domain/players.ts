import type { PlayerFact } from "./types";

/** Muted hues at similar lightness so no player color shouts. */
export const PLAYER_COLORS = [
  "#8fa7c9",
  "#c98f8f",
  "#8fc9a7",
  "#c9b98f",
  "#a78fc9",
  "#8fc3c9",
  "#c98fb5",
  "#a9c98f",
  "#c9a08f",
  "#8f9cc9",
  "#b5c98f",
  "#c98fa0",
];

export function colorForIndex(index: number): string {
  return PLAYER_COLORS[((index % PLAYER_COLORS.length) + PLAYER_COLORS.length) % PLAYER_COLORS.length];
}

export function normalizeName(name: string): string {
  return name
    .toLowerCase()
    .replace(/ё/g, "е")
    .replace(/ł/g, "l")
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

export function findSimilarPlayers(players: PlayerFact[], name: string): PlayerFact[] {
  const target = normalizeName(name);
  if (target.length < 3) return [];
  return players.filter((p) => {
    const candidate = normalizeName(p.name);
    if (candidate === target) return true;
    const shorter = candidate.length < target.length ? candidate : target;
    const longer = shorter === candidate ? target : candidate;
    return shorter.length >= 3 && longer.startsWith(shorter);
  });
}

export function initials(name: string): string {
  return name
    .trim()
    .split(/\s+/)
    .slice(0, 2)
    .map((part) => part.charAt(0).toUpperCase())
    .join("");
}

export function parseBulkNames(text: string): string[] {
  const seen = new Set<string>();
  const names: string[] = [];
  for (const line of text.split(/\r?\n/)) {
    const name = line.trim().replace(/\s+/g, " ");
    const key = normalizeName(name);
    if (!name || seen.has(key)) continue;
    seen.add(key);
    names.push(name);
  }
  return names;
}
