import { randomUUID } from "node:crypto";
import { eq } from "drizzle-orm";
import { SESSION_COOKIE, SESSION_TTL_SECONDS, hashPassword, issueToken, verifyPassword } from "../../../src/lib/auth";
import { getDb } from "../../../src/lib/db";
import { users } from "../../../src/lib/db/schema";

const INVALID = { error: "Invalid email or password" };
const DUMMY_HASH = hashPassword(randomUUID());

export async function POST(request: Request): Promise<Response> {
  const body = (await request.json().catch(() => null)) as { email?: unknown; password?: unknown } | null;
  if (typeof body?.email !== "string" || typeof body?.password !== "string") {
    return Response.json({ error: "email and password are required" }, { status: 400 });
  }

  const [user] = await getDb()
    .select()
    .from(users)
    .where(eq(users.email, body.email.trim().toLowerCase()));
  // Check a password even for unknown emails, so response time does not reveal which accounts exist.
  const valid = await verifyPassword(body.password, user?.passwordHash ?? (await DUMMY_HASH));
  if (!user || !valid) return Response.json(INVALID, { status: 401 });

  const token = await issueToken({ id: user.id, email: user.email });
  const secure = process.env.NODE_ENV === "production" ? "; Secure" : "";
  return Response.json(
    { user: { id: user.id, email: user.email } },
    {
      headers: {
        "set-cookie": `${SESSION_COOKIE}=${token}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${SESSION_TTL_SECONDS}${secure}`,
      },
    },
  );
}
