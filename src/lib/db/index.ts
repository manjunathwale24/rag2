import { drizzle, type PostgresJsDatabase } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import * as schema from "./schema";

export type Db = PostgresJsDatabase<typeof schema>;

let client: Db | undefined;

/**
 * Lazily created so that `next build` does not require DATABASE_URL.
 * `prepare: false` keeps the client compatible with pooled Neon connection strings.
 */
export function getDb(): Db {
  if (!client) {
    const url = process.env.DATABASE_URL;
    if (!url) throw new Error("DATABASE_URL is not set");
    client = drizzle(postgres(url, { prepare: false, max: 1 }), { schema });
  }
  return client;
}

export { schema };
