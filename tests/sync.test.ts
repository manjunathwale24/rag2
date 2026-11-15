import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { after, beforeEach, describe, it } from "node:test";
import { and, asc, eq, isNull } from "drizzle-orm";
import { closeDb, getDb, resetTestDatabase } from "./helpers/db";
import { memoryBlobStore, type MemoryBlobStore } from "./helpers/memory-store";
import { EMBEDDING_DIMENSIONS, chunks, documents, knowledgeBases, users } from "../src/lib/db/schema";
import { syncKnowledgeBase, type SyncDeps } from "../src/lib/ingest/sync";

const MARKDOWN_GUIDE = [
  "# Guide",
  "",
  "## Install",
  "",
  "Run the installer.",
  "",
  "## Usage",
  "",
  "Open the app and ask questions.",
].join("\n");

type Clock = { now: number };

function fakeDeps(store: MemoryBlobStore, clock: Clock, stepMs = 0) {
  const embedCalls: number[] = [];
  const deps: SyncDeps = {
    store,
    now: () => clock.now,
    embed: async (texts) => {
      embedCalls.push(texts.length);
      clock.now += stepMs;
      return texts.map(() => Array.from({ length: EMBEDDING_DIMENSIONS }, (_, i) => (i === 0 ? 1 : 0)));
    },
  };
  return { deps, embedCalls };
}

async function seedKb() {
  const db = getDb();
  const [user] = await db
    .insert(users)
    .values({ email: `${randomUUID()}@example.test`, passwordHash: "x" })
    .returning();
  const [kb] = await db
    .insert(knowledgeBases)
    .values({
      ownerId: user.id,
      name: "Test KB",
      parentTokens: 1000,
      childTokens: 100,
      overlapTokens: 10,
    })
    .returning();
  return kb;
}

async function seedDocument(kbId: string, filename: string) {
  const [doc] = await getDb()
    .insert(documents)
    .values({
      kbId,
      pathname: `kbs/${kbId}/${filename}`,
      filename,
      mimeType: "text/markdown",
      sizeBytes: 1,
      sha256: "unused",
    })
    .returning();
  return doc;
}

function putFile(store: MemoryBlobStore, kbId: string, filename: string, text: string) {
  store.files.set(`kbs/${kbId}/${filename}`, new TextEncoder().encode(text));
}

async function documentByName(kbId: string, filename: string) {
  const [doc] = await getDb()
    .select()
    .from(documents)
    .where(and(eq(documents.kbId, kbId), eq(documents.filename, filename)));
  return doc;
}

describe("syncKnowledgeBase", () => {
  beforeEach(async () => {
    await resetTestDatabase();
  });

  after(async () => {
    await closeDb();
  });

  it("indexes a pending document into parent and child chunks with embeddings", async () => {
    const kb = await seedKb();
    await seedDocument(kb.id, "guide.md");
    const store = memoryBlobStore();
    putFile(store, kb.id, "guide.md", MARKDOWN_GUIDE);
    const clock = { now: 0 };
    const { deps } = fakeDeps(store, clock);

    const result = await syncKnowledgeBase(kb.id, { budgetMs: 60_000 }, deps);

    assert.equal(result.remaining, 0);
    const doc = await documentByName(kb.id, "guide.md");
    assert.equal(doc.status, "indexed");
    assert.ok(doc.indexedAt);

    const db = getDb();
    const parents = await db
      .select()
      .from(chunks)
      .where(and(eq(chunks.documentId, doc.id), eq(chunks.level, 0)));
    const children = await db
      .select()
      .from(chunks)
      .where(and(eq(chunks.documentId, doc.id), eq(chunks.level, 1)))
      .orderBy(asc(chunks.position));

    assert.equal(parents.length, 2);
    assert.ok(children.length >= 2);
    const parentIds = new Set(parents.map((p) => p.id));
    assert.ok(children.every((c) => c.parentId !== null && parentIds.has(c.parentId)));
    assert.ok(children.every((c) => c.embedding !== null));
    assert.ok(children.some((c) => c.headingPath === "Guide > Install"));
  });

  it("resumes embedding in a later call when the time budget runs out", async () => {
    const kb = await seedKb();
    const doc = await seedDocument(kb.id, "long.md");
    const store = memoryBlobStore();
    putFile(store, kb.id, "long.md", "word ".repeat(8000));
    const clock = { now: 0 };
    const { deps, embedCalls } = fakeDeps(store, clock, 1000);

    const first = await syncKnowledgeBase(kb.id, { budgetMs: 1500 }, deps);

    assert.ok(first.remaining > 0);
    assert.equal((await documentByName(kb.id, "long.md")).status, "pending");
    assert.deepEqual(embedCalls, [32, 32]);
    const firstParents = await getDb()
      .select({ id: chunks.id })
      .from(chunks)
      .where(and(eq(chunks.documentId, doc.id), eq(chunks.level, 0)));

    const second = await syncKnowledgeBase(kb.id, { budgetMs: Number.MAX_SAFE_INTEGER }, deps);

    assert.equal(second.remaining, 0);
    assert.equal((await documentByName(kb.id, "long.md")).status, "indexed");
    const unembedded = await getDb()
      .select({ id: chunks.id })
      .from(chunks)
      .where(and(eq(chunks.documentId, doc.id), eq(chunks.level, 1), isNull(chunks.embedding)));
    assert.equal(unembedded.length, 0);
    const parents = await getDb()
      .select({ id: chunks.id })
      .from(chunks)
      .where(and(eq(chunks.documentId, doc.id), eq(chunks.level, 0)));
    assert.equal(parents.length, firstParents.length, "resuming must not duplicate parents");
  });

  it("marks a broken document failed, keeps indexing the rest, and retries it on the next sync", async () => {
    const kb = await seedKb();
    await seedDocument(kb.id, "broken.md");
    await seedDocument(kb.id, "good.md");
    const store = memoryBlobStore();
    putFile(store, kb.id, "broken.md", "   ");
    putFile(store, kb.id, "good.md", MARKDOWN_GUIDE);
    const clock = { now: 0 };
    const { deps } = fakeDeps(store, clock);

    const first = await syncKnowledgeBase(kb.id, { budgetMs: 60_000 }, deps);

    assert.equal(first.remaining, 0);
    const broken = await documentByName(kb.id, "broken.md");
    assert.equal(broken.status, "failed");
    assert.match(broken.error ?? "", /no text could be extracted/i);
    assert.equal((await documentByName(kb.id, "good.md")).status, "indexed");

    putFile(store, kb.id, "broken.md", MARKDOWN_GUIDE);
    await syncKnowledgeBase(kb.id, { budgetMs: 60_000 }, deps);

    const retried = await documentByName(kb.id, "broken.md");
    assert.equal(retried.status, "indexed");
    assert.equal(retried.error, null);
  });

  it("removes rows whose blob is gone, and only within the synced knowledge base", async () => {
    const kb = await seedKb();
    const otherKb = await seedKb();
    await seedDocument(kb.id, "gone.md");
    await seedDocument(kb.id, "kept.md");
    await seedDocument(otherKb.id, "other.md");
    const store = memoryBlobStore();
    putFile(store, kb.id, "kept.md", MARKDOWN_GUIDE);
    putFile(store, otherKb.id, "other.md", MARKDOWN_GUIDE);
    const clock = { now: 0 };
    const { deps } = fakeDeps(store, clock);

    await syncKnowledgeBase(kb.id, { budgetMs: 60_000 }, deps);

    assert.equal(await documentByName(kb.id, "gone.md"), undefined);
    assert.equal((await documentByName(kb.id, "kept.md")).status, "indexed");
    assert.equal((await documentByName(otherKb.id, "other.md")).status, "pending");
  });

  it("deletes nothing when the blob listing fails", async () => {
    const kb = await seedKb();
    await seedDocument(kb.id, "at-risk.md");
    const store = memoryBlobStore();
    store.failListing = true;
    const clock = { now: 0 };
    const { deps } = fakeDeps(store, clock);

    await assert.rejects(syncKnowledgeBase(kb.id, { budgetMs: 60_000 }, deps), /listing unavailable/);

    assert.ok(await documentByName(kb.id, "at-risk.md"));
  });
});
