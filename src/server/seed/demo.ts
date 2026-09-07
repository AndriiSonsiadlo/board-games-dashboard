import { colorForIndex } from "@/domain/players";
import type { Db } from "../db/client";
import { loadFacts } from "../repo/facts";
import { bumpVersion, insertPlayer, insertSession } from "../repo/writes";

export const DEMO_NAMES = [
  "Andrii",
  "Max",
  "Dmytro",
  "Sasha",
  "Olena",
  "Iryna",
  "Taras",
  "Kateryna",
  "Bohdan",
  "Yulia",
  "Mykola",
  "Oksana",
  "Roman",
  "Natalia",
  "Pavlo",
  "Sofia",
  "Artem",
  "Daria",
  "Vlad",
  "Anna",
  "Ihor",
  "Marta",
];

const RESULT_COUNT = 15;
const TIE_RESULT_INDEX = 6;

/** Small deterministic PRNG so demo data looks the same on every machine. */
function mulberry32(seed: number): () => number {
  let state = seed;
  return () => {
    state = (state + 0x6d2b79f5) | 0;
    let t = Math.imul(state ^ (state >>> 15), 1 | state);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function seedDemo(db: Db, now = Date.now()): { players: number; results: number } {
  return db.transaction((tx) => {
    const facts = loadFacts(tx);
    if (facts.players.some((p) => p.isDemo)) {
      throw new Error("Demo data already present. Run `npm run db:clear-demo` first.");
    }
    const games = facts.games.filter((g) => g.active);
    const tables = facts.tables.filter((t) => t.active);
    if (games.length === 0 || tables.length < 2) throw new Error("Base seed missing. Run `npm run setup` first.");

    const rand = mulberry32(42);
    const shuffle = <T>(items: T[]): T[] => {
      const copy = [...items];
      for (let i = copy.length - 1; i > 0; i--) {
        const j = Math.floor(rand() * (i + 1));
        [copy[i], copy[j]] = [copy[j], copy[i]];
      }
      return copy;
    };

    const offset = facts.players.length;
    const ids = DEMO_NAMES.map((name, i) =>
      insertPlayer(tx, {
        name,
        nickname: null,
        color: colorForIndex(offset + i),
        source: i % 5 === 4 ? "checkin" : "admin",
        isDemo: true,
        createdAt: now - 4 * 3_600_000 + i * 60_000,
      }),
    );

    const tieGame = games.find((g) => g.allowTies);
    const jokerUsed = new Set<number>();

    for (let i = 0; i < RESULT_COUNT; i++) {
      const game = i === TIE_RESULT_INDEX && tieGame ? tieGame : games[Math.floor(rand() * games.length)];
      const minCount = Math.max(game.minPlayers, 3);
      const maxCount = Math.max(minCount, Math.min(game.maxPlayers, 5));
      const count = minCount + Math.floor(rand() * (maxCount - minCount + 1));
      const seated = shuffle(ids).slice(0, count);
      const finishOrder = shuffle(seated);
      const finishedAt = now - (RESULT_COUNT - i) * 11 * 60_000;
      const startedAt = finishedAt - Math.round(game.durationMin * (0.8 + rand() * 0.4) * 60_000);
      const jokerPlayer = i % 4 === 1 ? seated.find((id) => !jokerUsed.has(id)) : undefined;
      if (jokerPlayer !== undefined) jokerUsed.add(jokerPlayer);
      const withTie = i === TIE_RESULT_INDEX && game === tieGame;

      insertSession(
        tx,
        {
          tableId: tables[i % tables.length].id,
          gameId: game.id,
          status: "done",
          createdAt: startedAt - 60_000,
          startedAt,
          finishedAt,
          isDemo: true,
        },
        seated.map((playerId, seat) => {
          const rank = finishOrder.indexOf(playerId) + 1;
          return {
            playerId,
            seat,
            jokerDeclared: playerId === jokerPlayer,
            placement: withTie && rank === 2 ? 1 : rank,
          };
        }),
      );
    }

    const free = shuffle(ids);
    const catan = games.find((g) => g.slug === "catan") ?? games[0];
    const splendor = games.find((g) => g.slug === "splendor") ?? games[0];
    const seats = (playerIds: number[]) =>
      playerIds.map((playerId, seat) => ({ playerId, seat, jokerDeclared: false, placement: null }));

    insertSession(
      tx,
      {
        tableId: tables[0].id,
        gameId: catan.id,
        status: "playing",
        createdAt: now - 26 * 60_000,
        startedAt: now - 25 * 60_000,
        isDemo: true,
      },
      seats(free.slice(0, Math.min(4, catan.maxPlayers))),
    );
    insertSession(
      tx,
      { tableId: tables[1].id, gameId: splendor.id, status: "setup", createdAt: now - 2 * 60_000, isDemo: true },
      seats(free.slice(4, 4 + Math.min(3, splendor.maxPlayers))),
    );

    bumpVersion(tx);
    return { players: ids.length, results: RESULT_COUNT };
  });
}
