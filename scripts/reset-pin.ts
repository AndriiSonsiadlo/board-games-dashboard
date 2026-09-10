import { eq } from "drizzle-orm";
import { hashPin } from "../src/server/auth/pin";
import { defaultDbPath, openDb } from "../src/server/db/client";
import * as s from "../src/server/db/schema";
import { loadEnv } from "./env";

loadEnv();
const pin = process.env.ADMIN_PIN;
if (!pin || !/^\d{4,8}$/.test(pin)) {
  console.error("Set ADMIN_PIN (4-8 digits) in .env first.");
  process.exit(1);
}
const db = openDb(defaultDbPath());
db.update(s.event).set({ adminPinHash: hashPin(pin) }).where(eq(s.event.id, 1)).run();
db.$client.close();
console.log("Admin PIN reset from .env.");
