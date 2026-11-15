import { randomUUID } from "node:crypto";
import { after, beforeEach, describe, test } from "node:test";
import assert from "node:assert/strict";
import { closeDb, getDb, resetTestDatabase } from "./helpers/db";
import { users } from "../src/lib/db/schema";
import { POST } from "../app/api/signup/route";
import { CAPTCHA_TOKEN, mockTurnstile } from "./helpers/captcha";

process.env.AUTH_SECRET = "test-secret-that-is-at-least-32-characters-long";

const PASSWORD = "correct horse battery";

function signupRequest(body: Record<string, unknown>): Request {
  return new Request("http://localhost/api/signup", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ captchaToken: CAPTCHA_TOKEN, ...body }),
  });
}

describe("POST /api/signup", () => {
  beforeEach(async () => {
    mockTurnstile(true);
    await resetTestDatabase();
  });

  after(async () => {
    await closeDb();
  });

  test("creates the account and signs the new user in with a session cookie", async () => {
    const response = await POST(signupRequest({ email: "Ana@Example.test", password: PASSWORD }));

    assert.equal(response.status, 201);
    const body = (await response.json()) as { user: { email: string } };
    assert.equal(body.user.email, "ana@example.test");
    assert.match(response.headers.get("set-cookie") ?? "", /^rag_session=[^;]+;.*HttpOnly/);
    const rows = await getDb().select().from(users);
    assert.equal(rows.length, 1);
  });

  test("an email that already has an account gets a 409 and no cookie", async () => {
    await POST(signupRequest({ email: "ana@example.test", password: PASSWORD }));

    const response = await POST(signupRequest({ email: "ANA@example.test", password: "another password" }));

    assert.equal(response.status, 409);
    assert.equal(response.headers.get("set-cookie"), null);
    assert.deepEqual(await response.json(), { error: "An account already exists for ana@example.test" });
  });

  test("a password shorter than 8 characters is rejected before any account is created", async () => {
    const response = await POST(signupRequest({ email: `${randomUUID()}@example.test`, password: "short" }));

    assert.equal(response.status, 400);
    assert.deepEqual(await response.json(), { error: "Password must be at least 8 characters" });
    assert.equal((await getDb().select().from(users)).length, 0);
  });

  test("a failed CAPTCHA creates no account and sets no cookie", async () => {
    mockTurnstile(false);

    const response = await POST(signupRequest({ email: "ana@example.test", password: PASSWORD }));

    assert.equal(response.status, 400);
    assert.equal(response.headers.get("set-cookie"), null);
    assert.deepEqual(await response.json(), { error: "CAPTCHA check failed. Please try again." });
    assert.equal((await getDb().select().from(users)).length, 0);
  });

  test("a missing or malformed email is rejected", async () => {
    const missing = await POST(signupRequest({ password: PASSWORD }));
    const malformed = await POST(signupRequest({ email: "not-an-email", password: PASSWORD }));

    for (const response of [missing, malformed]) {
      assert.equal(response.status, 400);
      assert.deepEqual(await response.json(), { error: "A valid email is required" });
    }
  });
});
