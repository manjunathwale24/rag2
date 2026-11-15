import { SESSION_COOKIE, SESSION_TTL_SECONDS, issueToken } from "../../../src/lib/auth";
import { createUser, AccountExistsError } from "../../../src/lib/users";

const MIN_PASSWORD_LENGTH = 8;
const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export async function POST(request: Request): Promise<Response> {
  const body = (await request.json().catch(() => null)) as { email?: unknown; password?: unknown } | null;
  if (typeof body?.email !== "string" || !EMAIL_PATTERN.test(body.email.trim())) {
    return Response.json({ error: "A valid email is required" }, { status: 400 });
  }
  if (typeof body.password !== "string" || body.password.length < MIN_PASSWORD_LENGTH) {
    return Response.json({ error: `Password must be at least ${MIN_PASSWORD_LENGTH} characters` }, { status: 400 });
  }

  let user: { id: string; email: string };
  try {
    user = await createUser({ email: body.email, password: body.password });
  } catch (error) {
    if (error instanceof AccountExistsError) {
      return Response.json({ error: error.message }, { status: 409 });
    }
    throw error;
  }

  const token = await issueToken({ id: user.id, email: user.email });
  const secure = process.env.NODE_ENV === "production" ? "; Secure" : "";
  return Response.json(
    { user: { id: user.id, email: user.email } },
    {
      status: 201,
      headers: {
        "set-cookie": `${SESSION_COOKIE}=${token}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${SESSION_TTL_SECONDS}${secure}`,
      },
    },
  );
}
