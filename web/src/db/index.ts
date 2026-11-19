import { mkdirSync } from "node:fs";
import path from "node:path";
import { PGlite } from "@electric-sql/pglite";
import { drizzle as drizzlePglite } from "drizzle-orm/pglite";
import { migrate as migratePglite } from "drizzle-orm/pglite/migrator";
import { drizzle as drizzlePg } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import * as schema from "./schema";

export type Db = ReturnType<typeof drizzlePglite<typeof schema>>;

const MIGRATIONS = path.join(process.cwd(), "drizzle");

async function create(): Promise<Db> {
  const url = process.env.DATABASE_URL;
  if (url) {
    // Production: Neon Postgres via its pooled connection string (PgBouncer,
    // transaction mode). Migrations run separately via `npm run db:migrate`.
    const client = postgres(url, {
      prepare: false, // required behind a transaction-mode pooler
      max: Number(process.env.DB_POOL_MAX ?? 3), // per serverless instance; Neon's pooler fans these out
      idle_timeout: 20, // seconds; release connections between bursts
      connect_timeout: 15, // seconds; a scaled-to-zero Neon compute needs a moment to wake
    });
    return drizzlePg(client, { schema }) as unknown as Db;
  }
  // Local development: embedded Postgres stored on disk, migrated on boot.
  const dir = process.env.PGLITE_DIR ?? path.join(process.cwd(), ".data", "pglite");
  mkdirSync(path.dirname(dir), { recursive: true });
  const client = new PGlite(dir);
  const db = drizzlePglite(client, { schema });
  await migratePglite(db, { migrationsFolder: MIGRATIONS });
  return db;
}

const g = globalThis as unknown as { __temantiketDb?: Promise<Db> };

export function getDb(): Promise<Db> {
  if (!g.__temantiketDb) {
    g.__temantiketDb = create().catch((err) => {
      g.__temantiketDb = undefined;
      throw err;
    });
  }
  return g.__temantiketDb;
}

export { schema };
