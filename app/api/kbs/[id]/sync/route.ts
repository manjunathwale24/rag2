import { and, eq } from "drizzle-orm";
import { getUserFromRequest } from "../../../../../src/lib/auth";
import { getDb } from "../../../../../src/lib/db";
import { knowledgeBases } from "../../../../../src/lib/db/schema";
import { defaultSyncDeps, syncKnowledgeBase } from "../../../../../src/lib/ingest/sync";

// Hobby plan limit is 60 seconds. The budget leaves headroom so the response is sent before the limit.
export const maxDuration = 60;
const SYNC_BUDGET_MS = 45_000;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
): Promise<Response> {
  const user = await getUserFromRequest(request);
  if (!user) return Response.json({ error: "Sign in required" }, { status: 401 });

  const { id } = await params;
  // Return 404 for both missing and other users' KBs so existence is not revealed.
  if (!UUID.test(id)) return Response.json({ error: "Not found" }, { status: 404 });
  const [kb] = await getDb()
    .select({ id: knowledgeBases.id })
    .from(knowledgeBases)
    .where(and(eq(knowledgeBases.id, id), eq(knowledgeBases.ownerId, user.id)));
  if (!kb) return Response.json({ error: "Not found" }, { status: 404 });

  const result = await syncKnowledgeBase(kb.id, { budgetMs: SYNC_BUDGET_MS }, defaultSyncDeps());
  return Response.json(result);
}
