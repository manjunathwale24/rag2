import { SESSION_COOKIE } from "../../../src/lib/auth";

/** Signing out only needs to clear the cookie. The JWT itself stays valid until it expires. */
export async function POST(): Promise<Response> {
  return Response.json(
    { ok: true },
    { headers: { "set-cookie": `${SESSION_COOKIE}=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0` } },
  );
}
