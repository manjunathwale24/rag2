import { after, beforeEach, describe, test } from "node:test";
import assert from "node:assert/strict";
import { closeDb, getDb, resetTestDatabase } from "./helpers/db";
import { knowledgeBases, users } from "../src/lib/db/schema";
import { DEFAULT_CHUNKING } from "../src/lib/kbs";
import { SESSION_COOKIE, issueToken } from "../src/lib/auth";
import { POST } from "../app/api/kbs/[id]/retrieve/route";

process.env.AUTH_SECRET = "test-secret-that-is-at-least-32-characters-long";

async function insertUserWithKb(email: string): Promise<{ user: { id: string; email: string }; kbId: string }> {
  const [user] = await getDb()
    .insert(users)
    .values({ email, passwordHash: "not-used-in-these-tests" })
    .returning({ id: users.id, email: users.email });
  const [kb] = await getDb()
    .insert(knowledgeBases)
    .values({ ownerId: user.id, name: "KB", ...DEFAULT_CHUNKING })
    .returning({ id: knowledgeBases.id });
  return { user, kbId: kb.id };
}

function retrieveRequest(
  kbId: string,
  body: unknown,
  cookie?: string,
): { request: Request; context: { params: Promise<{ id: string }> } } {
  const headers: HeadersInit = { "content-type": "application/json" };
  if (cookie) headers.cookie = `${SESSION_COOKIE}=${cookie}`;
  return {
    request: new Request(`http://localhost/api/kbs/${kbId}/retrieve`, {
      method: "POST",
      headers,
      body: JSON.stringify(body),
    }),
    context: { params: Promise.resolve({ id: kbId }) },
  };
}

describe("POST /api/kbs/[id]/retrieve", () => {
  beforeEach(async () => {
    await resetTestDatabase();
  });

  after(async () => {
    await closeDb();
  });

  test("retrieving requires a signed-in user", async () => {
    const { kbId } = await insertUserWithKb("ana@example.test");

    const { request, context } = retrieveRequest(kbId, { question: "What is the warranty?" });
    const response = await POST(request, context);

    assert.equal(response.status, 401);
  });

  test("another user's knowledge base looks the same as a missing one", async () => {
    const { kbId } = await insertUserWithKb("ana@example.test");
    const ben = await insertUserWithKb("ben@example.test");

    const { request, context } = retrieveRequest(kbId, { question: "What is the warranty?" }, await issueToken(ben.user));
    const response = await POST(request, context);

    assert.equal(response.status, 404);
  });

  test("a question is required", async () => {
    const { user, kbId } = await insertUserWithKb("ana@example.test");

    const { request, context } = retrieveRequest(kbId, { question: "  " }, await issueToken(user));
    const response = await POST(request, context);

    assert.equal(response.status, 400);
  });
});
