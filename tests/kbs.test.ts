import { after, beforeEach, describe, test } from "node:test";
import assert from "node:assert/strict";
import { closeDb, getDb, resetTestDatabase } from "./helpers/db";
import { knowledgeBases, users } from "../src/lib/db/schema";
import { SESSION_COOKIE, issueToken } from "../src/lib/auth";
import { GET, POST } from "../app/api/kbs/route";

process.env.AUTH_SECRET = "test-secret-that-is-at-least-32-characters-long";

async function insertUser(email: string): Promise<{ id: string; email: string }> {
  const [user] = await getDb()
    .insert(users)
    .values({ email, passwordHash: "not-used-in-these-tests" })
    .returning({ id: users.id, email: users.email });
  return user;
}

async function sessionHeaders(user: { id: string; email: string }): Promise<HeadersInit> {
  const token = await issueToken(user);
  return { "content-type": "application/json", cookie: `${SESSION_COOKIE}=${token}` };
}

function postKb(headers: HeadersInit, body: unknown): Request {
  return new Request("http://localhost/api/kbs", { method: "POST", headers, body: JSON.stringify(body) });
}

describe("/api/kbs", () => {
  beforeEach(async () => {
    await resetTestDatabase();
  });

  after(async () => {
    await closeDb();
  });

  test("creating a knowledge base requires a signed-in user", async () => {
    const response = await POST(postKb({ "content-type": "application/json" }, { name: "Manuals" }));
    assert.equal(response.status, 401);
  });

  test("a signed-in user creates a knowledge base they own, with chunk settings", async () => {
    const ana = await insertUser("ana@example.test");

    const response = await POST(postKb(await sessionHeaders(ana), { name: "Manuals" }));

    assert.equal(response.status, 201);
    const kb = (await response.json()) as { id: string; name: string; parentTokens: number };
    assert.equal(kb.name, "Manuals");
    assert.ok(kb.parentTokens > 0);
    const [row] = await getDb().select().from(knowledgeBases);
    assert.equal(row.ownerId, ana.id);
  });

  test("an empty name is rejected", async () => {
    const ana = await insertUser("ana@example.test");

    const response = await POST(postKb(await sessionHeaders(ana), { name: "   " }));

    assert.equal(response.status, 400);
  });

  test("listing returns only the caller's knowledge bases", async () => {
    const ana = await insertUser("ana@example.test");
    const ben = await insertUser("ben@example.test");
    await POST(postKb(await sessionHeaders(ana), { name: "Ana's KB" }));
    await POST(postKb(await sessionHeaders(ben), { name: "Ben's KB" }));

    const response = await GET(
      new Request("http://localhost/api/kbs", { headers: await sessionHeaders(ana) }),
    );

    assert.equal(response.status, 200);
    const { knowledgeBases: listed } = (await response.json()) as { knowledgeBases: { name: string }[] };
    assert.deepEqual(listed.map((kb) => kb.name), ["Ana's KB"]);
  });
});
