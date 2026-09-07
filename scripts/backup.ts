import { backupDir, createBackup } from "../src/server/backup";
import { defaultDbPath, openDb } from "../src/server/db/client";

const file = defaultDbPath();
const db = openDb(file);
const out = createBackup(db, backupDir(file));
db.$client.close();
console.log(`Backup written to ${out}`);
