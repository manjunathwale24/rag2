import type { RetrievedParent } from "./retrieve";

type Source = Pick<RetrievedParent, "filename" | "headingPath" | "text">;

const DEFAULT_URL = "https://router.huggingface.co/v1/chat/completions";
const DEFAULT_MODEL = "Qwen/Qwen2.5-7B-Instruct";
const NOT_FOUND = "I couldn't find anything in this knowledge base that answers that question.";
const SYSTEM_PROMPT =
  "Answer the question using only the numbered sources. Cite the sources you use, like [1]. " +
  "If the sources do not contain the answer, say so.";

export async function answerQuestion(question: string, sources: Source[]): Promise<string> {
  if (sources.length === 0) return NOT_FOUND;

  const token = process.env.HF_TOKEN;
  if (!token) throw new Error("HF_TOKEN is not set");

  const context = sources
    .map((source, i) => `[${i + 1}] ${source.filename} - ${source.headingPath}\n${source.text}`)
    .join("\n\n");

  const response = await fetch(process.env.HF_CHAT_URL ?? DEFAULT_URL, {
    method: "POST",
    headers: { authorization: `Bearer ${token}`, "content-type": "application/json" },
    body: JSON.stringify({
      model: process.env.HF_CHAT_MODEL ?? DEFAULT_MODEL,
      messages: [
        { role: "system", content: SYSTEM_PROMPT },
        { role: "user", content: `Sources:\n\n${context}\n\nQuestion: ${question}` },
      ],
      max_tokens: 500,
    }),
  });

  if (!response.ok) {
    throw new Error(`Chat request failed with ${response.status}: ${await response.text()}`);
  }

  const data = (await response.json()) as { choices?: { message?: { content?: string } }[] };
  const content = data.choices?.[0]?.message?.content;
  if (!content) throw new Error("Chat response had no answer text");
  return content.trim();
}
