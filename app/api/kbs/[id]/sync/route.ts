import { getUserFromRequest } from "../../../../../src/lib/auth";
import { defaultSyncDeps, syncKnowledgeBase } from "../../../../../src/lib/ingest/sync";
import { findOwnedKbId } from "../../../../../src/lib/kbs";

// Hobby plan limit is 60 seconds. The budget leaves headroom so the response is sent before the limit.
export const maxDuration = 60;
const SYNC_BUDGET_MS = 45_000;

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
): Promise<Response> {
  const user = await getUserFromRequest(request);
  if (!user) return Response.json({ error: "Sign in required" }, { status: 401 });

  const { id } = await params;
  const kbId = await findOwnedKbId(id, user.id);
  if (!kbId) return Response.json({ error: "Not found" }, { status: 404 });

  const result = await syncKnowledgeBase(kbId, { budgetMs: SYNC_BUDGET_MS }, defaultSyncDeps());
  return Response.json(result);
}
