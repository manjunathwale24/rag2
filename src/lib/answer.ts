import type { RetrievedParent } from "./retrieve";

type Source = Pick<RetrievedParent, "filename" | "headingPath" | "text"> &
  Partial<Pick<RetrievedParent, "matchedText" | "score">>;

// A smaller prompt answers faster. Sources arrive best first, so the extra ones add cost but rarely the answer.
const MAX_SOURCES = 3;
const MIN_RELATIVE_SCORE = 0.7;
const MAX_SOURCE_CHARS = 1500;

const NVIDIA_URL = "https://integrate.api.nvidia.com/v1/chat/completions";
const NVIDIA_MODEL = "google/gemma-4-31b-it";
const NOT_FOUND = "I couldn't find anything in this knowledge base that answers that question.";
const SYSTEM_PROMPT =
  "Answer the question using only the numbered sources. Cite the sources you use, like [1]. " +
  "If the sources do not contain the answer, say so.";

/** Keeps the best few sources and trims each to a window around the passage that matched the question. */
export function selectContext(sources: Source[]): Source[] {
  const best = sources[0]?.score;
  return sources
    .filter((source) => best === undefined || source.score === undefined || source.score >= best * MIN_RELATIVE_SCORE)
    .slice(0, MAX_SOURCES)
    .map((source) => ({ ...source, text: trimAround(source.text, source.matchedText) }));
}

function trimAround(text: string, matched?: string): string {
  if (text.length <= MAX_SOURCE_CHARS) return text;
  const at = matched ? text.indexOf(matched) : -1;
  const center = at === -1 ? 0 : at + Math.floor(matched!.length / 2);
  const start = Math.min(Math.max(0, center - MAX_SOURCE_CHARS / 2), text.length - MAX_SOURCE_CHARS);
  return text.slice(start, start + MAX_SOURCE_CHARS).trim();
}

export async function answerQuestion(question: string, sources: Source[]): Promise<string> {
  if (sources.length === 0) return NOT_FOUND;

  const key = process.env.NVIDIA_API_KEY;
  if (!key) throw new Error("NVIDIA_API_KEY is not set");
  const url = process.env.NVIDIA_CHAT_URL ?? NVIDIA_URL;
  const model = process.env.NVIDIA_CHAT_MODEL ?? NVIDIA_MODEL;

  const context = selectContext(sources)
    .map((source, i) => `[${i + 1}] ${source.filename} - ${source.headingPath}\n${source.text}`)
    .join("\n\n");

  const response = await fetch(url, {
    method: "POST",
    headers: { authorization: `Bearer ${key}`, "content-type": "application/json" },
    body: JSON.stringify({
      model,
      messages: [
        { role: "system", content: SYSTEM_PROMPT },
        { role: "user", content: `Sources:\n\n${context}\n\nQuestion: ${question}` },
      ],
      temperature: 0,
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
