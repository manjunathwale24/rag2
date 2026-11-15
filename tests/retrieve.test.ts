import { randomUUID } from "node:crypto";
import { after, beforeEach, describe, test } from "node:test";
import assert from "node:assert/strict";
import { closeDb, getDb, resetTestDatabase } from "./helpers/db";
import { EMBEDDING_DIMENSIONS, chunks, documents, knowledgeBases, users } from "../src/lib/db/schema";
import { rankParents, searchParents, type ChildHit } from "../src/lib/retrieve";

/** A unit vector pointing along one axis, so distances are easy to reason about. */
const axis = (i: number) => Array.from({ length: EMBEDDING_DIMENSIONS }, (_, j) => (j === i ? 1 : 0));

const hit = (parentId: string, distance: number, child: string): ChildHit => ({
  parentId,
  distance,
  childContent: child,
  parentContent: `parent of ${parentId}`,
  headingPath: `H ${parentId}`,
  filename: `${parentId}.md`,
});

test("several child hits from one parent collapse into a single result with the best score", () => {
  const hits = [hit("a", 0.1, "a1"), hit("b", 0.2, "b1"), hit("a", 0.3, "a2")];

  const results = rankParents(hits, 5);

  assert.deepEqual(
    results.map((r) => [r.parentId, r.matchedText, r.score]),
    [
      ["a", "a1", 0.9],
      ["b", "b1", 0.8],
    ],
  );
});

test("results are capped at topK and keep nearest-first order", () => {
  const hits = [hit("c", 0.05, "c"), hit("a", 0.1, "a"), hit("b", 0.2, "b")];

  assert.deepEqual(
    rankParents(hits, 2).map((r) => r.parentId),
    ["c", "a"],
  );
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

async function seedDocument(kbId: string) {
  const [doc] = await getDb()
    .insert(documents)
    .values({
      kbId,
      pathname: `kbs/${kbId}/${randomUUID()}.md`,
      filename: "guide.md",
      mimeType: "text/markdown",
      sizeBytes: 10,
      sha256: "unused",
      status: "indexed",
    })
    .returning();
  return doc;
}

/** Stores one parent section and one embedded child that points at it. Returns the parent id. */
async function seedParentWithChild(kbId: string, documentId: string, parentText: string, heading: string, vector: number[]) {
  const db = getDb();
  const [parent] = await db
    .insert(chunks)
    .values({ kbId, documentId, level: 0, position: 0, headingPath: heading, content: parentText, tokenCount: 10 })
    .returning();
  await db.insert(chunks).values({
    kbId,
    documentId,
    parentId: parent.id,
    level: 1,
    position: 0,
    headingPath: heading,
    content: `child of ${parentText}`,
    tokenCount: 5,
    embedding: vector,
  });
  return parent.id;
}

describe("searchParents", () => {
  beforeEach(async () => {
    await resetTestDatabase();
  });

  after(async () => {
    await closeDb();
  });

  test("returns parents ordered by how close their best child is to the query vector", async () => {
    const kb = await seedKb();
    const doc = await seedDocument(kb.id);
    const installId = await seedParentWithChild(kb.id, doc.id, "Install section", "Guide > Install", axis(0));
    const usageId = await seedParentWithChild(kb.id, doc.id, "Usage section", "Guide > Usage", axis(1));

    const results = await searchParents(kb.id, axis(0), 2);

    assert.deepEqual(
      results.map((r) => r.parentId),
      [installId, usageId],
    );
    assert.equal(results[0].text, "Install section");
    assert.equal(results[0].headingPath, "Guide > Install");
    assert.equal(results[0].filename, "guide.md");
    assert.ok(Math.abs(results[0].score - 1) < 1e-6);
  });

  test("never returns parents from another knowledge base", async () => {
    const kbA = await seedKb();
    const kbB = await seedKb();
    const docA = await seedDocument(kbA.id);
    const docB = await seedDocument(kbB.id);
    const ownId = await seedParentWithChild(kbA.id, docA.id, "Mine", "Mine", axis(0));
    await seedParentWithChild(kbB.id, docB.id, "Theirs", "Theirs", axis(0));

    const results = await searchParents(kbA.id, axis(0), 5);

    assert.deepEqual(
      results.map((r) => r.parentId),
      [ownId],
    );
  });
});
