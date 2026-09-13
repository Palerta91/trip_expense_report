import { drizzle } from "drizzle-orm/node-postgres";
import { Pool } from "pg";
import * as schema from "./schema";

// Next.js evaluates route modules during `next build`. The fallback is never used
// by the production Compose stack, which always supplies DATABASE_URL at runtime.
const databaseUrl = process.env.DATABASE_URL ?? "postgresql://unused:unused@127.0.0.1:5432/unused";

const globalForDb = globalThis as unknown as { pool?: Pool };

const pool = globalForDb.pool ?? new Pool({ connectionString: databaseUrl, max: 10 });

if (process.env.NODE_ENV !== "production") {
  globalForDb.pool = pool;
}

export const db = drizzle({ client: pool, schema });
