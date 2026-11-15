import { after, beforeEach, describe, test } from "node:test";
import assert from "node:assert/strict";
import { closeDb, getDb, resetTestDatabase } from "./helpers/db";
import { documents, knowledgeBases, users } from "../src/lib/db/schema";
import { DEFAULT_CHUNKING } from "../src/lib/kbs";
import { SESSION_COOKIE, issueToken } from "../src/lib/auth";
import { GET, POST } from "../app/api/kbs/[id]/documents/route";
import { POST as createUploadToken } from "../app/api/blob/upload/route";

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

function documentsRequest(
  method: "GET" | "POST",
  kbId: string,
  body?: unknown,
  cookie?: string,
): { request: Request; context: { params: Promise<{ id: string }> } } {
  const headers: HeadersInit = { "content-type": "application/json" };
  if (cookie) headers.cookie = `${SESSION_COOKIE}=${cookie}`;
  return {
    request: new Request(`http://localhost/api/kbs/${kbId}/documents`, {
      method,
      headers,
      body: body === undefined ? undefined : JSON.stringify(body),
    }),
    context: { params: Promise.resolve({ id: kbId }) },
  };
}

describe("/api/kbs/[id]/documents", () => {
  beforeEach(async () => {
    await resetTestDatabase();
  });

  after(async () => {
    await closeDb();
  });

  test("listing documents returns only the owner's documents", async () => {
    const { user, kbId } = await insertUserWithKb("ana@example.test");
    const ben = await insertUserWithKb("ben@example.test");
    await getDb().insert(documents).values({
      kbId,
      pathname: `kbs/${kbId}/a/manual.pdf`,
      filename: "manual.pdf",
      mimeType: "application/pdf",
      sizeBytes: 10,
      sha256: "x",
    });

    const owner = documentsRequest("GET", kbId, undefined, await issueToken(user));
    const ownerResponse = await GET(owner.request, owner.context);
    const other = documentsRequest("GET", kbId, undefined, await issueToken(ben.user));
    const otherResponse = await GET(other.request, other.context);

    assert.equal(ownerResponse.status, 200);
    const { documents: listed } = (await ownerResponse.json()) as { documents: { filename: string }[] };
    assert.deepEqual(listed.map((doc) => doc.filename), ["manual.pdf"]);
    assert.equal(otherResponse.status, 404);
  });

  test("registering a document requires sign-in", async () => {
    const { kbId } = await insertUserWithKb("ana@example.test");

    const { request, context } = documentsRequest("POST", kbId, { pathname: `kbs/${kbId}/a/manual.pdf` });
    const response = await POST(request, context);

    assert.equal(response.status, 401);
  });

  test("a pathname outside this knowledge base is rejected before any blob is read", async () => {
    const { user, kbId } = await insertUserWithKb("ana@example.test");

    const { request, context } = documentsRequest(
      "POST",
      kbId,
      { pathname: "kbs/someone-else/a/manual.pdf" },
      await issueToken(user),
    );
    const response = await POST(request, context);

    assert.equal(response.status, 400);
  });

  test("the upload token endpoint requires sign-in before it issues a token", async () => {
    const response = await createUploadToken(
      new Request("http://localhost/api/blob/upload", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ type: "blob.generate-client-token", payload: { pathname: "x", callbackUrl: "x", multipart: false, clientPayload: null } }),
      }),
    );

    assert.equal(response.status, 401);
  });
});
