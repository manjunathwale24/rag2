import { migrate } from "drizzle-orm/postgres-js/migrator";
import { createUser } from "../../src/lib/users";
import { closeDb, getDb, resetTestDatabase } from "../helpers/db";

export const E2E_PASSWORD = "e2e-password-123";
export const USER_A = "e2e-a@example.com";
export const USER_B = "e2e-b@example.com";

// Runs once before the browser tests: a clean test database with two users.
export default async function globalSetup(): Promise<void> {
  await migrate(getDb(), { migrationsFolder: "./drizzle" });
  await resetTestDatabase();
  await createUser({ email: USER_A, password: E2E_PASSWORD });
  await createUser({ email: USER_B, password: E2E_PASSWORD });
  await closeDb();
}
