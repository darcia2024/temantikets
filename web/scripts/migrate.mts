// Apply migrations to the production database (Neon).
// Usage (PowerShell): $env:DATABASE_URL_UNPOOLED="postgresql://..."; npm run db:migrate
// Uses the direct (unpooled) connection when available: migrations need a real
// session, not Neon's transaction-mode pooler. Local PGlite migrates itself.
import { drizzle } from "drizzle-orm/postgres-js";
import { migrate } from "drizzle-orm/postgres-js/migrator";
import postgres from "postgres";

const url = process.env.DATABASE_URL_UNPOOLED ?? process.env.DATABASE_URL;
if (!url) {
  console.error("Isi DATABASE_URL_UNPOOLED (atau DATABASE_URL) dengan connection string Neon.");
  console.error("Untuk lokal tidak perlu: PGlite migrasi otomatis.");
  process.exit(1);
}
const client = postgres(url, { max: 1, connect_timeout: 30, onnotice: () => {} });
await migrate(drizzle(client), { migrationsFolder: "drizzle" });
await client.end();
console.log("Migrasi selesai.");
