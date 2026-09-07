import fs from "node:fs";
import path from "node:path";
import type { Db } from "./db/client";

export const BACKUP_INTERVAL_MS = 5 * 60_000;
export const BACKUP_KEEP = 50;

let lastBackupAt = Number.NEGATIVE_INFINITY;

export function backupDir(dbFile: string): string {
  return path.join(path.dirname(dbFile), "backups");
}

export function pruneBackups(dir: string, keep: number): void {
  const files = fs
    .readdirSync(dir)
    .filter((name) => name.startsWith("board-cup-") && name.endsWith(".db"))
    .sort()
    .reverse();
  for (const name of files.slice(keep)) fs.rmSync(path.join(dir, name), { force: true });
}

export function createBackup(db: Db, dir: string, now = Date.now()): string {
  fs.mkdirSync(dir, { recursive: true });
  const stamp = new Date(now).toISOString().replace(/[:.]/g, "-");
  const file = path.join(dir, `board-cup-${stamp}.db`);
  db.$client.exec(`VACUUM INTO '${file.replace(/'/g, "''")}'`);
  pruneBackups(dir, BACKUP_KEEP);
  return file;
}

/** Called after every committed mutation; backs up at most once per interval. Never throws. */
export function maybeBackup(db: Db, dir: string, now = Date.now()): string | null {
  if (now - lastBackupAt < BACKUP_INTERVAL_MS) return null;
  lastBackupAt = now;
  try {
    return createBackup(db, dir, now);
  } catch (error) {
    console.error("Backup failed", error);
    return null;
  }
}

export function resetBackupClock(): void {
  lastBackupAt = Number.NEGATIVE_INFINITY;
}
