import { hashPassword } from "./auth";
import { getDb } from "./db";
import { users } from "./db/schema";

const UNIQUE_VIOLATION = "23505";

export class AccountExistsError extends Error {}

export async function createUser(input: { email: string; password: string }): Promise<{ id: string; email: string }> {
  const email = input.email.trim().toLowerCase();
  const passwordHash = await hashPassword(input.password);
  try {
    const [row] = await getDb().insert(users).values({ email, passwordHash }).returning({ id: users.id, email: users.email });
    return row;
  } catch (error) {
    const code = (error as { code?: string; cause?: { code?: string } }).code ?? (error as { cause?: { code?: string } }).cause?.code;
    if (code === UNIQUE_VIOLATION) {
      throw new AccountExistsError(`An account already exists for ${email}`);
    }
    throw error;
  }
}
