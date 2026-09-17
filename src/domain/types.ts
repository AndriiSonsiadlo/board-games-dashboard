import type { BrandFields } from "./brand";

export type EventStatus = "draft" | "live" | "finished";
export type ScoringStrategy = "total" | "bestN";
export type SessionStatus = "setup" | "playing" | "pending" | "done" | "cancelled";
export type SceneId = "title" | "room" | "recent" | "counters" | "achievements" | "story" | "popular" | "contenders";
export type Lang = "en" | "ru";
export type PlayerSource = "admin" | "checkin";

export const ALL_SCENES: SceneId[] = ["title", "room", "recent", "counters", "achievements", "story", "popular", "contenders"];
export const DEFAULT_SCENES: SceneId[] = ["title", "room", "recent", "counters", "achievements", "story", "popular"];
export const MILESTONES = [10, 25, 50, 75, 100] as const;

export interface ScoringSettings {
  strategy: ScoringStrategy;
  bestN: number;
  participationFloor: number;
  jokerMultiplier: number;
}

export interface ScreenControl {
  paused: boolean;
  skipNonce: number;
  finaleStep: number;
}

export interface EventFact {
  name: string;
  city: string;
  year: number;
  status: EventStatus;
  startedAt: number | null;
  finishedAt: number | null;
  finaleRevealed: boolean;
  scoring: ScoringSettings;
  sceneDurationSec: number;
  enabledScenes: SceneId[];
  showPointsInReveals: boolean;
  screenLang: Lang;
  accentColor: string;
  publicBaseUrl: string | null;
  brandFields: BrandFields;
  screenControl: ScreenControl;
  dataVersion: number;
}

export interface PlayerFact {
  id: number;
  name: string;
  nickname: string | null;
  color: string;
  source: PlayerSource;
  active: boolean;
  isDemo: boolean;
  createdAt: number;
}

export interface GameFact {
  id: number;
  slug: string;
  name: string;
  family: string;
  descriptionEn: string;
  descriptionRu: string;
  icon: string;
  category: string;
  durationMin: number;
  weight: number;
  minPlayers: number;
  maxPlayers: number;
  allowTies: boolean;
  active: boolean;
}

export interface TableFact {
  id: number;
  number: number;
  label: string | null;
  active: boolean;
}

export interface SessionPlayerFact {
  playerId: number;
  seat: number;
  jokerDeclared: boolean;
  placement: number | null;
}

export interface SessionFact {
  id: number;
  tableId: number | null;
  gameId: number;
  status: SessionStatus;
  createdAt: number;
  startedAt: number | null;
  finishedAt: number | null;
  notes: string | null;
  isDemo: boolean;
  players: SessionPlayerFact[];
}

export type AnnouncementFact =
  | { id: number; type: "result_reveal"; payload: { sessionId: number }; createdAt: number }
  | { id: number; type: "milestone"; payload: { count: number }; createdAt: number }
  | {
      id: number;
      type: "achievement";
      payload: { sessionId: number; playerId: number; achievementId: string };
      createdAt: number;
    };

export interface Facts {
  event: EventFact;
  players: PlayerFact[];
  games: GameFact[];
  tables: TableFact[];
  sessions: SessionFact[];
  announcements: AnnouncementFact[];
  /** Achievement ids switched off in admin; every other achievement is enabled. */
  disabledAchievements: string[];
  /** Achievement ids whose sealed flag the admin changed, with the chosen value. */
  sealedOverrides: Record<string, boolean>;
}

export type AuditAction =
  | "result.create"
  | "result.update"
  | "result.delete"
  | "joker.correct"
  | "session.cancel"
  | "player.merge"
  | "undo";

export const UNDOABLE_ACTIONS: AuditAction[] = [
  "result.create",
  "result.update",
  "result.delete",
  "joker.correct",
];

export interface AuditEntry {
  id: number;
  at: number;
  action: AuditAction;
  summary: string;
  before: SessionFact | null;
  after: SessionFact | null;
  undone: boolean;
}
