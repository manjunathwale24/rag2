import { getUserFromRequest } from "../../../../../src/lib/auth";
import { answerQuestion, selectContext } from "../../../../../src/lib/answer";
import { retrieve } from "../../../../../src/lib/retrieve";
import { findOwnedKbId } from "../../../../../src/lib/kbs";

const TOP_K = 5;

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
): Promise<Response> {
  const user = await getUserFromRequest(request);
  if (!user) return Response.json({ error: "Sign in required" }, { status: 401 });

  const { id } = await params;
  const kbId = await findOwnedKbId(id, user.id);
  if (!kbId) return Response.json({ error: "Not found" }, { status: 404 });

  const body = (await request.json().catch(() => null)) as { question?: unknown } | null;
  const question = typeof body?.question === "string" ? body.question.trim() : "";
  if (!question) return Response.json({ error: "question is required" }, { status: 400 });

  const sources = await retrieve(kbId, question, TOP_K);
  const context = selectContext(sources);
  const answer = await answerQuestion(question, context);
  return Response.json({
    answer,
    sources: context.map((source) => ({
      filename: source.filename,
      headingPath: source.headingPath,
      score: source.score,
      text: source.text,
    })),
  });
}
