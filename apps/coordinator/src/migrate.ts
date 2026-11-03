// A separate Job adopts the frozen migration plan; the server then checks only.
import { Store } from "./database.js";
const mode = process.env.OMNICOMPILE_MIGRATION_MODE;
if (mode !== "apply" && mode !== "check")
  throw new Error("Explicit OMNICOMPILE_MIGRATION_MODE=apply or check is required");
for (const key of ["DB_HOST", "DB_PORT", "DB_NAME", "DB_USER", "DB_PASSWORD"])
  if (!process.env[key]) throw new Error(`Required migration setting: ${key}`);
const port = Number(process.env.DB_PORT);
if (!Number.isInteger(port) || port < 1 || port > 65535)
  throw new Error("Invalid database port");
const store = await Store.connect({
  host: process.env.DB_HOST!,
  port,
  name: process.env.DB_NAME!,
  user: process.env.DB_USER!,
  password: process.env.DB_PASSWORD!,
});
await store.close();
console.log(`Migration ${mode} completed using the immutable ledger.`);
