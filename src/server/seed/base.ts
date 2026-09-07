import { eq } from "drizzle-orm";
import type { GameFact } from "@/domain/types";
import { hashPin, randomSecret } from "../auth/pin";
import type { Db } from "../db/client";
import * as s from "../db/schema";

export const BASE_GAMES: Array<Omit<GameFact, "id" | "active">> = [
  {
    slug: "uno",
    name: "Uno",
    family: "uno",
    descriptionEn: "Match colors and numbers. Empty your hand first.",
    descriptionRu: "Совпадайте цветом или числом и первым избавьтесь от карт.",
    icon: "Layers",
    category: "party",
    durationMin: 20,
    weight: 4,
    minPlayers: 2,
    maxPlayers: 10,
    allowTies: false,
  },
  {
    slug: "splendor",
    name: "Splendor",
    family: "splendor",
    descriptionEn: "Collect gems, buy developments, attract nobles.",
    descriptionRu: "Собирайте самоцветы, покупайте развития, привлекайте знать.",
    icon: "Gem",
    category: "engine",
    durationMin: 30,
    weight: 6,
    minPlayers: 2,
    maxPlayers: 4,
    allowTies: false,
  },
  {
    slug: "hitster",
    name: "Hitster",
    family: "hitster",
    descriptionEn: "Place songs on a timeline by release year.",
    descriptionRu: "Расставляйте песни на шкале времени по году выхода.",
    icon: "Music",
    category: "music",
    durationMin: 30,
    weight: 6,
    minPlayers: 2,
    maxPlayers: 10,
    allowTies: true,
  },
  {
    slug: "rats-race",
    name: "Rats Race",
    family: "rats-race",
    descriptionEn: "Escape the rat race: grow your income and break out first.",
    descriptionRu: "Выберитесь из крысиных бегов: наращивайте доход и вырвитесь первым.",
    icon: "Rat",
    category: "economic",
    durationMin: 60,
    weight: 7,
    minPlayers: 2,
    maxPlayers: 6,
    allowTies: false,
  },
  {
    slug: "citadels",
    name: "Citadels",
    family: "citadels",
    descriptionEn: "Pick secret roles and build the grandest city.",
    descriptionRu: "Выбирайте тайные роли и стройте самый великий город.",
    icon: "Castle",
    category: "bluffing",
    durationMin: 45,
    weight: 8,
    minPlayers: 2,
    maxPlayers: 8,
    allowTies: false,
  },
  {
    slug: "ticket-to-ride",
    name: "Ticket to Ride",
    family: "ticket-to-ride",
    descriptionEn: "Claim railway routes across the map.",
    descriptionRu: "Прокладывайте железнодорожные маршруты по карте.",
    icon: "TrainFront",
    category: "route",
    durationMin: 60,
    weight: 10,
    minPlayers: 2,
    maxPlayers: 5,
    allowTies: false,
  },
  {
    slug: "seven-wonders",
    name: "7 Wonders",
    family: "seven-wonders",
    descriptionEn: "Draft cards across three ages to build a civilization.",
    descriptionRu: "Разыгрывайте карты три эпохи и развивайте цивилизацию.",
    icon: "Landmark",
    category: "civilization",
    durationMin: 40,
    weight: 10,
    minPlayers: 3,
    maxPlayers: 7,
    allowTies: false,
  },
  {
    slug: "catan",
    name: "Catan",
    family: "catan",
    descriptionEn: "Trade resources, build roads and settlements.",
    descriptionRu: "Торгуйте ресурсами, стройте дороги и поселения.",
    icon: "Hexagon",
    category: "strategy",
    durationMin: 90,
    weight: 15,
    minPlayers: 3,
    maxPlayers: 4,
    allowTies: false,
  },
  {
    slug: "catan-expansion",
    name: "Catan + Expansion",
    family: "catan",
    descriptionEn: "Catan with an expansion: longer, larger, deeper.",
    descriptionRu: "Катан с дополнением: дольше, масштабнее, глубже.",
    icon: "Hexagon",
    category: "strategy",
    durationMin: 120,
    weight: 18,
    minPlayers: 3,
    maxPlayers: 6,
    allowTies: false,
  },
];

/** Idempotent: creates the event row, tables and missing games; never overwrites edits. */
export function seedBase(db: Db, opts: { adminPin: string; tableCount?: number }): void {
  db.transaction((tx) => {
    const existing = tx.select({ id: s.event.id }).from(s.event).where(eq(s.event.id, 1)).get();
    if (!existing) {
      tx.insert(s.event)
        .values({ id: 1, adminPinHash: hashPin(opts.adminPin), sessionSecret: randomSecret() })
        .run();
    }

    const tableCount = tx.select({ id: s.tables.id }).from(s.tables).all().length;
    if (tableCount === 0) {
      const count = opts.tableCount ?? 6;
      tx.insert(s.tables)
        .values(Array.from({ length: count }, (_, i) => ({ number: i + 1, label: null })))
        .run();
    }

    const slugs = new Set(tx.select({ slug: s.games.slug }).from(s.games).all().map((g) => g.slug));
    const missing = BASE_GAMES.filter((g) => !slugs.has(g.slug));
    if (missing.length > 0) tx.insert(s.games).values(missing).run();
  });
}
