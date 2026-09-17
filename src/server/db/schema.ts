import { sql } from "drizzle-orm";
import { integer, primaryKey, real, sqliteTable, text } from "drizzle-orm/sqlite-core";
import type { AuditAction, SceneId, ScreenControl, SessionFact } from "../../domain/types";

export const event = sqliteTable("event", {
  id: integer().primaryKey(),
  name: text().notNull().default("Board Games Cup"),
  city: text().notNull().default("Warsaw"),
  year: integer().notNull().default(2026),
  status: text({ enum: ["draft", "live", "finished"] }).notNull().default("draft"),
  startedAt: integer(),
  finishedAt: integer(),
  finaleRevealed: integer({ mode: "boolean" }).notNull().default(false),
  scoringStrategy: text({ enum: ["total", "bestN"] }).notNull().default("bestN"),
  bestN: integer().notNull().default(4),
  participationFloor: real().notNull().default(0.2),
  jokerMultiplier: real().notNull().default(1.5),
  sceneDurationSec: integer().notNull().default(12),
  enabledScenes: text({ mode: "json" })
    .$type<SceneId[]>()
    .notNull()
    .default(sql`'["title","room","recent","counters"]'`),
  showPointsInReveals: integer({ mode: "boolean" }).notNull().default(false),
  screenLang: text({ enum: ["en", "ru"] }).notNull().default("en"),
  accentColor: text().notNull().default("#c9a45c"),
  publicBaseUrl: text(),
  brandTopEn: text(),
  brandMainEn: text(),
  brandTopRu: text(),
  brandMainRu: text(),
  adminPinHash: text().notNull(),
  sessionSecret: text().notNull(),
  screenControl: text({ mode: "json" })
    .$type<ScreenControl>()
    .notNull()
    .default(sql`'{"paused":false,"skipNonce":0,"finaleStep":0}'`),
  dataVersion: integer().notNull().default(1),
});

export const players = sqliteTable("players", {
  id: integer().primaryKey({ autoIncrement: true }),
  name: text().notNull(),
  nickname: text(),
  color: text().notNull(),
  source: text({ enum: ["admin", "checkin"] }).notNull().default("admin"),
  active: integer({ mode: "boolean" }).notNull().default(true),
  isDemo: integer({ mode: "boolean" }).notNull().default(false),
  createdAt: integer().notNull(),
});

export const games = sqliteTable("games", {
  id: integer().primaryKey({ autoIncrement: true }),
  slug: text().notNull().unique(),
  name: text().notNull(),
  family: text().notNull(),
  descriptionEn: text().notNull().default(""),
  descriptionRu: text().notNull().default(""),
  icon: text().notNull().default("Dices"),
  category: text().notNull().default("strategy"),
  durationMin: integer().notNull().default(30),
  weight: real().notNull(),
  minPlayers: integer().notNull().default(2),
  maxPlayers: integer().notNull().default(6),
  allowTies: integer({ mode: "boolean" }).notNull().default(false),
  active: integer({ mode: "boolean" }).notNull().default(true),
});

export const tables = sqliteTable("tables", {
  id: integer().primaryKey({ autoIncrement: true }),
  number: integer().notNull().unique(),
  label: text(),
  active: integer({ mode: "boolean" }).notNull().default(true),
});

export const sessions = sqliteTable("sessions", {
  id: integer().primaryKey({ autoIncrement: true }),
  tableId: integer().references(() => tables.id),
  gameId: integer()
    .notNull()
    .references(() => games.id),
  status: text({ enum: ["setup", "playing", "pending", "done", "cancelled"] }).notNull(),
  createdAt: integer().notNull(),
  startedAt: integer(),
  finishedAt: integer(),
  notes: text(),
  isDemo: integer({ mode: "boolean" }).notNull().default(false),
});

export const sessionPlayers = sqliteTable(
  "session_players",
  {
    sessionId: integer()
      .notNull()
      .references(() => sessions.id, { onDelete: "cascade" }),
    playerId: integer()
      .notNull()
      .references(() => players.id),
    seat: integer().notNull(),
    jokerDeclared: integer({ mode: "boolean" }).notNull().default(false),
    placement: integer(),
  },
  (t) => [primaryKey({ columns: [t.sessionId, t.playerId] })],
);

export const announcements = sqliteTable("announcements", {
  id: integer().primaryKey({ autoIncrement: true }),
  type: text({ enum: ["result_reveal", "milestone", "achievement"] }).notNull(),
  payload: text({ mode: "json" }).$type<Record<string, number | string>>().notNull(),
  createdAt: integer().notNull(),
});

export const auditLog = sqliteTable("audit_log", {
  id: integer().primaryKey({ autoIncrement: true }),
  at: integer().notNull(),
  action: text().$type<AuditAction>().notNull(),
  summary: text().notNull(),
  before: text({ mode: "json" }).$type<SessionFact | null>(),
  after: text({ mode: "json" }).$type<SessionFact | null>(),
  undone: integer({ mode: "boolean" }).notNull().default(false),
});

export const achievementSettings = sqliteTable("achievement_settings", {
  achievementId: text().primaryKey(),
  enabled: integer({ mode: "boolean" }).notNull().default(true),
  /** null = the achievement's built-in default. */
  sealed: integer({ mode: "boolean" }),
});
