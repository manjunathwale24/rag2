import { mock } from "node:test";

export const CAPTCHA_TOKEN = "captcha-token-from-widget";

/** Makes Turnstile's siteverify call answer `success`, with no network access. */
export function mockTurnstile(success: boolean): void {
  mock.restoreAll();
  process.env.TURNSTILE_SECRET_KEY = "test-turnstile-secret";
  mock.method(globalThis, "fetch", async () => Response.json({ success }));
}
