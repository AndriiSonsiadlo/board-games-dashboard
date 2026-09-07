import fs from "node:fs";
import { defaultDbPath, openDb } from "../src/server/db/client";
import { seedBase } from "../src/server/seed/base";
import { loadEnv } from "./env";

if (!process.argv.includes("--yes")) {
  console.error("This deletes all event data. Re-run with --yes (npm run db:reset does this).");
  process.exit(1);
}
loadEnv();
const file = defaultDbPath();
for (const suffix of ["", "-wal", "-shm"]) fs.rmSync(file + suffix, { force: true });
const db = openDb(file);
seedBase(db, { adminPin: process.env.ADMIN_PIN ?? "1234" });
db.$client.close();
console.log(`Database reset at ${file}. Stop the server before resetting on Windows (the file is locked while running).`);
