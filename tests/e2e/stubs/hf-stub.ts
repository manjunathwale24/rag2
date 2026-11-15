import { createServer, type Server } from "node:http";
import { EMBEDDING_DIMENSIONS } from "../../../src/lib/db/schema";
import { readBody, sendJson } from "./http";

export const HF_STUB_PORT = 4011;

/**
 * Turns text into a unit vector by counting hashed words. Texts that share words get similar vectors,
 * so retrieval still picks the right chunk without a real model.
 */
export function fakeEmbedding(text: string): number[] {
  const vector = new Array<number>(EMBEDDING_DIMENSIONS).fill(0);
  for (const word of text.toLowerCase().match(/[a-z0-9]+/g) ?? []) {
    vector[fnv1a(word) % EMBEDDING_DIMENSIONS] += 1;
  }
  const length = Math.hypot(...vector);
  if (length === 0) {
    vector[0] = 1;
    return vector;
  }
  return vector.map((value) => value / length);
}

/** The chat stub answers with the text of source [1], so tests can check the right chunk was used. */
export function fakeAnswer(userMessage: string): string {
  const source = userMessage.match(/\[1\] [^\n]*\n([\s\S]*?)(?=\n\n\[\d+\]|\n\nQuestion:)/);
  return source ? `${source[1].trim()} [1]` : "The sources do not contain the answer.";
}

export function startHfStub(port = HF_STUB_PORT): Promise<Server> {
  const server = createServer(async (req, res) => {
    const url = req.url ?? "/";

    if (req.method === "GET" && url === "/health") return sendJson(res, 200, { ok: true });

    if (req.method === "POST" && url === "/embed") {
      const body = JSON.parse((await readBody(req)).toString("utf8")) as { inputs: string[] };
      return sendJson(res, 200, body.inputs.map(fakeEmbedding));
    }

    if (req.method === "POST" && url === "/chat") {
      const body = JSON.parse((await readBody(req)).toString("utf8")) as {
        messages: { role: string; content: string }[];
      };
      const userMessage = body.messages.filter((message) => message.role === "user").at(-1)?.content ?? "";
      return sendJson(res, 200, {
        choices: [{ index: 0, message: { role: "assistant", content: fakeAnswer(userMessage) } }],
      });
    }

    sendJson(res, 404, { error: `no stub route for ${req.method} ${url}` });
  });

  return new Promise((resolve) => server.listen(port, () => resolve(server)));
}

function fnv1a(word: string): number {
  let hash = 0x811c9dc5;
  for (let i = 0; i < word.length; i++) {
    hash ^= word.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193) >>> 0;
  }
  return hash;
}
