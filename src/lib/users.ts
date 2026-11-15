import { hashPassword } from "./auth";
import { getDb } from "./db";
import { users } from "./db/schema";

const UNIQUE_VIOLATION = "23505";

export async function createUser(input: { email: string; password: string }): Promise<void> {
  const email = input.email.trim().toLowerCase();
  const passwordHash = await hashPassword(input.password);
  try {
    await getDb().insert(users).values({ email, passwordHash });
  } catch (error) {
    const code = (error as { code?: string; cause?: { code?: string } }).code ?? (error as { cause?: { code?: string } }).cause?.code;
    if (code === UNIQUE_VIOLATION) {
      throw new Error(`An account already exists for ${email}`);
    }
    throw error;
  }
}
