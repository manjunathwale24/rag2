import { sql } from "drizzle-orm";
import { closeDb, getDb } from "../../src/lib/db";

const TEST_DATABASE_URL =
  process.env.TEST_DATABASE_URL ?? "postgres://postgres:dev@localhost:5433/rag2_test";

// Tests wipe tables, so refuse to run against anything that is not a *_test database.
if (!/_test$/.test(new URL(TEST_DATABASE_URL).pathname)) {
  throw new Error(`Refusing to run tests against a non-test database: ${TEST_DATABASE_URL}`);
}
process.env.DATABASE_URL = TEST_DATABASE_URL;

export { closeDb, getDb };

export async function resetTestDatabase(): Promise<void> {
  await getDb().execute(sql`TRUNCATE users, knowledge_bases, documents, chunks CASCADE`);
}
