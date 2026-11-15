import { drizzle, type PostgresJsDatabase } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import * as schema from "./schema";
import { databaseUrlFromEnv } from "./url";

export type Db = PostgresJsDatabase<typeof schema>;

let db: Db | undefined;
let sql: postgres.Sql | undefined;

/**
 * Lazily created so that `next build` does not require DATABASE_URL.
 * `prepare: false` keeps the client compatible with pooled Neon connection strings.
 */
export function getDb(): Db {
  if (!db) {
    const url = databaseUrlFromEnv(process.env);
    if (!url) throw new Error("DATABASE_URL is not set");
    sql = postgres(url, { prepare: false, max: 1 });
    db = drizzle(sql, { schema });
  }
  return db;
}

export async function closeDb(): Promise<void> {
  if (!sql) return;
  await sql.end();
  sql = undefined;
  db = undefined;
}

export { schema };
