import { defaultDbPath, openDb } from "../src/server/db/client";
import { seedBase } from "../src/server/seed/base";
import { seedDemo } from "../src/server/seed/demo";
import { loadEnv } from "./env";

loadEnv();
const db = openDb(defaultDbPath());
seedBase(db, { adminPin: process.env.ADMIN_PIN ?? "1234" });
const summary = seedDemo(db);
db.$client.close();
console.log(`Demo data added: ${summary.players} players, ${summary.results} results, 2 open tables.`);
