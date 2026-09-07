import Database from "better-sqlite3";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, expect, test } from "vitest";
import { BACKUP_INTERVAL_MS, createBackup, maybeBackup, pruneBackups, resetBackupClock } from "./backup";
import { createTestDb } from "./testDb";

let ctx: ReturnType<typeof createTestDb>;
let dir: string;
beforeEach(() => {
  ctx = createTestDb();
  dir = fs.mkdtempSync(path.join(os.tmpdir(), "board-cup-backups-"));
  resetBackupClock();
});
afterEach(() => {
  ctx.cleanup();
  fs.rmSync(dir, { recursive: true, force: true });
});

test("createBackup writes a readable copy", () => {
  const file = createBackup(ctx.db, dir, Date.UTC(2026, 8, 18, 19, 30));
  expect(path.basename(file)).toBe("board-cup-2026-09-18T19-30-00-000Z.db");
  const copy = new Database(file, { readonly: true });
  expect((copy.prepare("select count(*) as n from games").get() as { n: number }).n).toBe(9);
  copy.close();
});

test("pruneBackups keeps the newest files", () => {
  for (let i = 0; i < 5; i++) fs.writeFileSync(path.join(dir, `board-cup-2026-01-0${i + 1}.db`), "");
  pruneBackups(dir, 2);
  expect(fs.readdirSync(dir).sort()).toEqual(["board-cup-2026-01-04.db", "board-cup-2026-01-05.db"]);
});

test("maybeBackup throttles to one backup per interval", () => {
  const t = 1_000_000;
  expect(maybeBackup(ctx.db, dir, t)).not.toBeNull();
  expect(maybeBackup(ctx.db, dir, t + 1000)).toBeNull();
  expect(maybeBackup(ctx.db, dir, t + BACKUP_INTERVAL_MS)).not.toBeNull();
});
