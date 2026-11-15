import { and, eq } from "drizzle-orm";
import { getDb } from "./db";
import { knowledgeBases } from "./db/schema";

export const DEFAULT_CHUNKING = {
  parentTokens: 1000,
  childTokens: 250,
  overlapTokens: 50,
} as const;

export function parseKbName(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const name = value.trim();
  return name.length > 0 && name.length <= 120 ? name : null;
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Returns the KB id only when it exists and belongs to the user. Other users' KBs look like missing ones. */
export async function findOwnedKbId(kbId: string, ownerId: string): Promise<string | null> {
  if (!UUID.test(kbId)) return null;
  const [kb] = await getDb()
    .select({ id: knowledgeBases.id })
    .from(knowledgeBases)
    .where(and(eq(knowledgeBases.id, kbId), eq(knowledgeBases.ownerId, ownerId)));
  return kb?.id ?? null;
}
