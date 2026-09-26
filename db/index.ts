import { drizzle, type PostgresJsDatabase } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import * as schema from "./schema";

export type DB = PostgresJsDatabase<typeof schema>;

declare global {
  var __tpSql: ReturnType<typeof postgres> | undefined;
}

function createClient() {
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error("DATABASE_URL is not set");
  return postgres(url, {
    max: process.env.NODE_ENV === "production" ? 5 : 10,
    // Required for transaction-mode poolers (Supabase/Neon pgbouncer)
    prepare: false,
    onnotice: () => {},
  });
}

// Reuse the connection across hot reloads in development
const client = globalThis.__tpSql ?? createClient();
if (process.env.NODE_ENV !== "production") globalThis.__tpSql = client;

export const sqlClient = client;
export const db: DB = drizzle(client, { schema });
export { schema };
