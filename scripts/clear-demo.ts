import { defaultDbPath, openDb } from "../src/server/db/client";
import { bumpVersion, deleteDemoData } from "../src/server/repo/writes";

const db = openDb(defaultDbPath());
db.transaction((tx) => {
  deleteDemoData(tx);
  bumpVersion(tx);
});
db.$client.close();
console.log("Demo data removed.");
