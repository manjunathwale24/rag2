import { asc, eq } from "drizzle-orm";
import { getUserFromRequest } from "../../../../../src/lib/auth";
import { getDb } from "../../../../../src/lib/db";
import { documents } from "../../../../../src/lib/db/schema";
import { findOwnedKbId } from "../../../../../src/lib/kbs";
import { vercelBlobStore } from "../../../../../src/lib/storage";
import { isAllowedUploadPath, registerDocument } from "../../../../../src/lib/upload";

export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
): Promise<Response> {
  const user = await getUserFromRequest(request);
  if (!user) return Response.json({ error: "Sign in required" }, { status: 401 });

  const kbId = await findOwnedKbId((await params).id, user.id);
  if (!kbId) return Response.json({ error: "Not found" }, { status: 404 });

  const rows = await getDb()
    .select()
    .from(documents)
    .where(eq(documents.kbId, kbId))
    .orderBy(asc(documents.filename));
  return Response.json({ documents: rows });
}

/** Called by the browser after a successful direct upload to Blob. Records the file as pending indexing. */
export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
): Promise<Response> {
  const user = await getUserFromRequest(request);
  if (!user) return Response.json({ error: "Sign in required" }, { status: 401 });

  const kbId = await findOwnedKbId((await params).id, user.id);
  if (!kbId) return Response.json({ error: "Not found" }, { status: 404 });

  const body = (await request.json().catch(() => null)) as { pathname?: unknown } | null;
  if (typeof body?.pathname !== "string" || !isAllowedUploadPath(kbId, body.pathname)) {
    return Response.json({ error: "Upload path is not allowed for this knowledge base" }, { status: 400 });
  }

  const document = await registerDocument({ kbId, pathname: body.pathname, store: vercelBlobStore() });
  return Response.json(document, { status: 201 });
}
