import Database from "better-sqlite3";
import type { RunResult } from "better-sqlite3";
import { drizzle } from "drizzle-orm/better-sqlite3";
import { migrate } from "drizzle-orm/better-sqlite3/migrator";
import type { BaseSQLiteDatabase } from "drizzle-orm/sqlite-core";
import fs from "node:fs";
import path from "node:path";
import * as schema from "./schema";

function wrap(sqlite: Database.Database) {
  return drizzle({ client: sqlite, schema });
}

export type Db = ReturnType<typeof wrap>;
/** Either the database or a transaction; all repo functions accept it. Queries are synchronous. */
export type Tx = BaseSQLiteDatabase<"sync", RunResult, typeof schema>;

export function defaultDbPath(): string {
  return process.env.DB_PATH ?? path.join(process.cwd(), "data", "board-cup.db");
}

export function openDb(file: string): Db {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  const sqlite = new Database(file);
  sqlite.pragma("journal_mode = WAL");
  sqlite.pragma("foreign_keys = ON");
  sqlite.pragma("busy_timeout = 5000");
  const db = wrap(sqlite);
  migrate(db, { migrationsFolder: path.join(process.cwd(), "drizzle") });
  return db;
}

const globalForDb = globalThis as unknown as { __boardCupDb?: Db };

export function getDb(): Db {
  if (!globalForDb.__boardCupDb) globalForDb.__boardCupDb = openDb(defaultDbPath());
  return globalForDb.__boardCupDb;
}
