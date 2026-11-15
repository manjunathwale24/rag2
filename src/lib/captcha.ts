const DEFAULT_VERIFY_URL = "https://challenges.cloudflare.com/turnstile/v0/siteverify";

// Fails closed: a missing or unverified token is rejected, and a missing secret throws.
export async function verifyCaptcha(token: unknown): Promise<boolean> {
  const secret = process.env.TURNSTILE_SECRET_KEY;
  if (!secret) throw new Error("TURNSTILE_SECRET_KEY is not set");
  if (typeof token !== "string" || token.length === 0) return false;

  const response = await fetch(process.env.TURNSTILE_VERIFY_URL ?? DEFAULT_VERIFY_URL, {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ secret, response: token }),
  });
  const result = (await response.json()) as { success?: unknown };
  return result.success === true;
}
