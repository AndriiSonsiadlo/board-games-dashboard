import { defaultDbPath, openDb } from "../src/server/db/client";
import { seedBase } from "../src/server/seed/base";
import { loadEnv } from "./env";

loadEnv();
const pin = process.env.ADMIN_PIN ?? "1234";
if (!process.env.ADMIN_PIN) console.warn("ADMIN_PIN not set; using default PIN 1234. Change it in /admin/settings.");
const file = defaultDbPath();
const db = openDb(file);
seedBase(db, { adminPin: pin });
db.$client.close();
console.log(`Database ready at ${file}`);
