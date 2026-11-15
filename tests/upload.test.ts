import { createHash, randomUUID } from "node:crypto";
import { after, beforeEach, describe, test } from "node:test";
import assert from "node:assert/strict";
import { closeDb, getDb, resetTestDatabase } from "./helpers/db";
import { memoryBlobStore } from "./helpers/memory-store";
import { documents, knowledgeBases, users } from "../src/lib/db/schema";
import { isAllowedUploadPath, registerDocument } from "../src/lib/upload";

const KB_ID = "11111111-1111-4111-8111-111111111111";

describe("isAllowedUploadPath", () => {
  test("accepts a supported file inside the knowledge base's own folder", () => {
    assert.equal(isAllowedUploadPath(KB_ID, `kbs/${KB_ID}/${randomUUID()}/guide.md`), true);
  });

  test("rejects other knowledge bases, unsupported types and path tricks", () => {
    const other = "22222222-2222-4222-8222-222222222222";
    assert.equal(isAllowedUploadPath(KB_ID, `kbs/${other}/${randomUUID()}/guide.md`), false);
    assert.equal(isAllowedUploadPath(KB_ID, `kbs/${KB_ID}/${randomUUID()}/tool.exe`), false);
    assert.equal(isAllowedUploadPath(KB_ID, `kbs/${KB_ID}/../${randomUUID()}/guide.md`), false);
  });
});

describe("registerDocument", () => {
  beforeEach(async () => {
    await resetTestDatabase();
  });

  after(async () => {
    await closeDb();
  });

  async function seedKb() {
    const db = getDb();
    const [user] = await db
      .insert(users)
      .values({ email: `${randomUUID()}@example.test`, passwordHash: "x" })
      .returning();
    const [kb] = await db
      .insert(knowledgeBases)
      .values({ ownerId: user.id, name: "KB", parentTokens: 1000, childTokens: 100, overlapTokens: 10 })
      .returning();
    return kb;
  }

  test("records the uploaded file's size, hash and type as a pending document", async () => {
    const kb = await seedKb();
    const pathname = `kbs/${kb.id}/${randomUUID()}/guide.md`;
    const bytes = new TextEncoder().encode("# Guide\n\nHello");
    const store = memoryBlobStore();
    store.files.set(pathname, bytes);

    await registerDocument({ kbId: kb.id, pathname, store });

    const [doc] = await getDb().select().from(documents);
    assert.equal(doc.filename, "guide.md");
    assert.equal(doc.mimeType, "text/markdown");
    assert.equal(doc.sizeBytes, bytes.byteLength);
    assert.equal(doc.sha256, createHash("sha256").update(bytes).digest("hex"));
    assert.equal(doc.status, "pending");
  });

  test("registering the same upload twice keeps a single document", async () => {
    const kb = await seedKb();
    const pathname = `kbs/${kb.id}/${randomUUID()}/guide.md`;
    const store = memoryBlobStore();
    store.files.set(pathname, new TextEncoder().encode("Hello"));

    const first = await registerDocument({ kbId: kb.id, pathname, store });
    const second = await registerDocument({ kbId: kb.id, pathname, store });

    assert.equal(second.id, first.id);
    assert.equal((await getDb().select().from(documents)).length, 1);
  });
});
