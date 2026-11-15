import { test } from "node:test";
import assert from "node:assert/strict";
import {
  getUserFromRequest,
  hashPassword,
  issueToken,
  verifyPassword,
} from "../src/lib/auth";

process.env.AUTH_SECRET = "test-secret-that-is-at-least-32-characters-long";

const user = { id: "11111111-1111-4111-8111-111111111111", email: "ada@example.com" };

test("a password verifies only against its own hash", async () => {
  const hash = await hashPassword("correct horse");

  assert.notEqual(hash, "correct horse");
  assert.equal(await verifyPassword("correct horse", hash), true);
  assert.equal(await verifyPassword("wrong password", hash), false);
});

test("a bearer token identifies the user", async () => {
  const token = await issueToken(user);
  const request = new Request("http://localhost/api/kbs", {
    headers: { authorization: `Bearer ${token}` },
  });

  assert.deepEqual(await getUserFromRequest(request), user);
});

test("the session cookie identifies the user", async () => {
  const token = await issueToken(user);
  const request = new Request("http://localhost/api/kbs", {
    headers: { cookie: `theme=dark; rag_session=${token}` },
  });

  assert.deepEqual(await getUserFromRequest(request), user);
});

test("a token with a tampered signature is rejected", async () => {
  const token = await issueToken(user);
  const tampered = token.slice(0, -2) + (token.endsWith("AA") ? "BB" : "AA");
  const request = new Request("http://localhost/api/kbs", {
    headers: { authorization: `Bearer ${tampered}` },
  });

  assert.equal(await getUserFromRequest(request), null);
});

test("requests without credentials are rejected", async () => {
  assert.equal(await getUserFromRequest(new Request("http://localhost/api/kbs")), null);
});
