import { randomUUID } from "node:crypto";
import { and, asc, eq, inArray, isNull, ne, sql } from "drizzle-orm";
import { getDb, schema, type Db } from "../db";
import { embedTexts } from "../embed";
import { vercelBlobStore, type BlobStore } from "../storage";
import { chunkHierarchically } from "./chunk";
import { parseDocument } from "./parse";

const { documents, chunks, knowledgeBases } = schema;

const EMBED_BATCH_SIZE = 32;
const INSERT_BATCH_SIZE = 500;

export type SyncDeps = {
  store: BlobStore;
  now: () => number;
  embed: (texts: string[]) => Promise<number[][]>;
};

export type SyncOptions = { budgetMs: number };
export type SyncResult = { remaining: number };

type KnowledgeBase = typeof knowledgeBases.$inferSelect;
type Document = typeof documents.$inferSelect;

export function defaultSyncDeps(): SyncDeps {
  return { store: vercelBlobStore(), now: () => Date.now(), embed: embedTexts };
}

export async function syncKnowledgeBase(
  kbId: string,
  options: SyncOptions,
  deps: SyncDeps = defaultSyncDeps(),
): Promise<SyncResult> {
  const db = getDb();
  const [kb] = await db.select().from(knowledgeBases).where(eq(knowledgeBases.id, kbId));
  if (!kb) throw new Error(`Knowledge base not found: ${kbId}`);

  // A failed listing throws here, before anything is deleted.
  const blobs = await deps.store.listAll(`kbs/${kbId}/`);
  await deleteMissingDocuments(db, kbId, new Set(blobs.map((blob) => blob.pathname)));

  const deadline = deps.now() + options.budgetMs;
  const overBudget = () => deps.now() >= deadline;

  const work = await db
    .select()
    .from(documents)
    .where(and(eq(documents.kbId, kbId), ne(documents.status, "indexed")))
    .orderBy(asc(documents.createdAt));

  for (const doc of work) {
    if (overBudget()) break;
    try {
      await indexDocument(db, kb, doc, deps, overBudget);
    } catch (error) {
      await db
        .update(documents)
        .set({ status: "failed", error: errorMessage(error), updatedAt: new Date() })
        .where(eq(documents.id, doc.id));
    }
  }

  const [{ count }] = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(documents)
    .where(and(eq(documents.kbId, kbId), eq(documents.status, "pending")));
  return { remaining: count };
}

async function deleteMissingDocuments(db: Db, kbId: string, livePathnames: Set<string>) {
  const rows = await db
    .select({ id: documents.id, pathname: documents.pathname })
    .from(documents)
    .where(eq(documents.kbId, kbId));
  const goneIds = rows.filter((row) => !livePathnames.has(row.pathname)).map((row) => row.id);
  if (goneIds.length > 0) {
    await db.delete(documents).where(inArray(documents.id, goneIds));
  }
}

async function indexDocument(
  db: Db,
  kb: KnowledgeBase,
  doc: Document,
  deps: SyncDeps,
  overBudget: () => boolean,
) {
  const [alreadyChunked] = await db
    .select({ id: chunks.id })
    .from(chunks)
    .where(eq(chunks.documentId, doc.id))
    .limit(1);

  if (!alreadyChunked) {
    const bytes = await deps.store.read(doc.pathname);
    const text = await parseDocument(doc.filename, bytes);
    await saveChunks(db, kb, doc.id, text);
  }

  for (;;) {
    const batch = await db
      .select({ id: chunks.id, content: chunks.content, headingPath: chunks.headingPath })
      .from(chunks)
      .where(
        and(eq(chunks.documentId, doc.id), eq(chunks.level, 1), isNull(chunks.embedding)),
      )
      .orderBy(asc(chunks.position))
      .limit(EMBED_BATCH_SIZE);
    if (batch.length === 0) break;
    if (overBudget()) return;

    const inputs = batch.map((chunk) =>
      chunk.headingPath ? `${chunk.headingPath}\n\n${chunk.content}` : chunk.content,
    );
    const vectors = await deps.embed(inputs);
    for (let i = 0; i < batch.length; i++) {
      await db.update(chunks).set({ embedding: vectors[i] }).where(eq(chunks.id, batch[i].id));
    }
  }

  await db
    .update(documents)
    .set({ status: "indexed", error: null, indexedAt: new Date(), updatedAt: new Date() })
    .where(eq(documents.id, doc.id));
}

async function saveChunks(db: Db, kb: KnowledgeBase, documentId: string, text: string) {
  const { parents, children } = chunkHierarchically(text, {
    parentTokens: kb.parentTokens,
    childTokens: kb.childTokens,
    overlapTokens: kb.overlapTokens,
  });

  // Generate parent ids up front so children can reference them without a read-back.
  const parentIds = parents.map(() => randomUUID());

  const parentRows = parents.map((parent, i) => ({
    id: parentIds[i],
    kbId: kb.id,
    documentId,
    parentId: null,
    level: 0,
    position: parent.index,
    headingPath: parent.headingPath,
    content: parent.content,
    tokenCount: parent.tokenCount,
  }));
  const childRows = children.map((child) => ({
    kbId: kb.id,
    documentId,
    parentId: parentIds[child.parentIndex],
    level: 1,
    position: child.position,
    headingPath: child.headingPath,
    content: child.content,
    tokenCount: child.tokenCount,
  }));

  await db.transaction(async (tx) => {
    await insertInBatches(parentRows, (rows) => tx.insert(chunks).values(rows));
    await insertInBatches(childRows, (rows) => tx.insert(chunks).values(rows));
  });
}

async function insertInBatches<T>(rows: T[], insert: (batch: T[]) => Promise<unknown>) {
  for (let i = 0; i < rows.length; i += INSERT_BATCH_SIZE) {
    await insert(rows.slice(i, i + INSERT_BATCH_SIZE));
  }
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
