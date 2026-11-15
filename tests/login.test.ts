import { randomUUID } from "node:crypto";
import { after, beforeEach, describe, test } from "node:test";
import assert from "node:assert/strict";
import { closeDb, getDb, resetTestDatabase } from "./helpers/db";
import { users } from "../src/lib/db/schema";
import { hashPassword } from "../src/lib/auth";
import { POST } from "../app/api/login/route";

process.env.AUTH_SECRET = "test-secret-that-is-at-least-32-characters-long";

const PASSWORD = "correct horse battery";

function loginRequest(body: unknown): Request {
  return new Request("http://localhost/api/login", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
}

describe("POST /api/login", () => {
  beforeEach(async () => {
    await resetTestDatabase();
    await getDb()
      .insert(users)
      .values({ email: "ana@example.test", passwordHash: await hashPassword(PASSWORD) });
  });

  after(async () => {
    await closeDb();
  });

  test("correct credentials return the user and set an HttpOnly session cookie", async () => {
    const response = await POST(loginRequest({ email: "ana@example.test", password: PASSWORD }));

    assert.equal(response.status, 200);
    const body = (await response.json()) as { user: { email: string } };
    assert.equal(body.user.email, "ana@example.test");
    const cookie = response.headers.get("set-cookie") ?? "";
    assert.match(cookie, /^rag_session=[^;]+;/);
    assert.match(cookie, /HttpOnly/);
  });

  test("a wrong password and an unknown email both get the same 401 with no cookie", async () => {
    const wrongPassword = await POST(loginRequest({ email: "ana@example.test", password: "nope" }));
    const unknownEmail = await POST(loginRequest({ email: `${randomUUID()}@example.test`, password: PASSWORD }));

    for (const response of [wrongPassword, unknownEmail]) {
      assert.equal(response.status, 401);
      assert.equal(response.headers.get("set-cookie"), null);
      assert.deepEqual(await response.json(), { error: "Invalid email or password" });
    }
  });
});
