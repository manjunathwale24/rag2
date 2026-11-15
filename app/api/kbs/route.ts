import { desc, eq } from "drizzle-orm";
import { getUserFromRequest } from "../../../src/lib/auth";
import { getDb } from "../../../src/lib/db";
import { knowledgeBases } from "../../../src/lib/db/schema";
import { DEFAULT_CHUNKING, parseKbName } from "../../../src/lib/kbs";

export async function GET(request: Request): Promise<Response> {
  const user = await getUserFromRequest(request);
  if (!user) return Response.json({ error: "Sign in required" }, { status: 401 });

  const rows = await getDb()
    .select()
    .from(knowledgeBases)
    .where(eq(knowledgeBases.ownerId, user.id))
    .orderBy(desc(knowledgeBases.createdAt));
  return Response.json({ knowledgeBases: rows });
}

export async function POST(request: Request): Promise<Response> {
  const user = await getUserFromRequest(request);
  if (!user) return Response.json({ error: "Sign in required" }, { status: 401 });

  const body = (await request.json().catch(() => null)) as { name?: unknown } | null;
  const name = parseKbName(body?.name);
  if (!name) return Response.json({ error: "name must be 1 to 120 characters" }, { status: 400 });

  const [kb] = await getDb()
    .insert(knowledgeBases)
    .values({ ownerId: user.id, name, ...DEFAULT_CHUNKING })
    .returning();
  return Response.json(kb, { status: 201 });
}
