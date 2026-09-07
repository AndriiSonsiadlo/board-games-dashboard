import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { openDb, type Db } from "./db/client";
import { seedBase } from "./seed/base";

export function createTestDb(): { db: Db; file: string; cleanup: () => void } {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "board-cup-"));
  const file = path.join(dir, "test.db");
  const db = openDb(file);
  seedBase(db, { adminPin: "1234", tableCount: 3 });
  return {
    db,
    file,
    cleanup: () => {
      db.$client.close();
      fs.rmSync(dir, { recursive: true, force: true });
    },
  };
}
