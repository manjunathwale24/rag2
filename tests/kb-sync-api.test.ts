import { after, beforeEach, describe, test } from "node:test";
import assert from "node:assert/strict";
import { closeDb, getDb, resetTestDatabase } from "./helpers/db";
import { knowledgeBases, users } from "../src/lib/db/schema";
import { DEFAULT_CHUNKING } from "../src/lib/kbs";
import { SESSION_COOKIE, issueToken } from "../src/lib/auth";
import { POST } from "../app/api/kbs/[id]/sync/route";

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

function syncRequest(kbId: string, cookie?: string): { request: Request; context: { params: Promise<{ id: string }> } } {
  const headers: HeadersInit = cookie ? { cookie: `${SESSION_COOKIE}=${cookie}` } : {};
  return {
    request: new Request(`http://localhost/api/kbs/${kbId}/sync`, { method: "POST", headers }),
    context: { params: Promise.resolve({ id: kbId }) },
  };
}

describe("POST /api/kbs/[id]/sync", () => {
  beforeEach(async () => {
    await resetTestDatabase();
  });

  after(async () => {
    await closeDb();
  });

  test("syncing requires a signed-in user", async () => {
    const { kbId } = await insertUserWithKb("ana@example.test");

    const { request, context } = syncRequest(kbId);
    const response = await POST(request, context);

    assert.equal(response.status, 401);
  });

  test("another user's knowledge base looks the same as a missing one", async () => {
    const { kbId } = await insertUserWithKb("ana@example.test");
    const ben = await insertUserWithKb("ben@example.test");
    const token = await issueToken(ben.user);

    const { request, context } = syncRequest(kbId, token);
    const response = await POST(request, context);

    assert.equal(response.status, 404);
  });
});
