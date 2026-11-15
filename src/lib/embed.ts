import { EMBEDDING_DIMENSIONS } from "./db/schema";

const BATCH_SIZE = 32;
const MODEL = "nvidia/nemotron-3-embed-1b";
const DEFAULT_URL = "https://integrate.api.nvidia.com/v1/embeddings";

// "passage" when indexing documents, "query" when embedding a question. NVIDIA's model needs this to match them well.
export type InputType = "passage" | "query";

type EmbeddingResponse = { data?: { index: number; embedding: number[] }[] };

export async function embedTexts(texts: string[], inputType: InputType = "passage"): Promise<number[][]> {
  const vectors: number[][] = [];
  for (let i = 0; i < texts.length; i += BATCH_SIZE) {
    vectors.push(...(await embedBatch(texts.slice(i, i + BATCH_SIZE), inputType)));
  }
  return vectors;
}

async function embedBatch(inputs: string[], inputType: InputType): Promise<number[][]> {
  const url = process.env.NVIDIA_EMBEDDING_URL ?? DEFAULT_URL;
  const key = process.env.NVIDIA_API_KEY;
  if (!key) throw new Error("NVIDIA_API_KEY is not set");

  for (let attempt = 1; ; attempt++) {
    const response = await fetch(url, {
      method: "POST",
      headers: { authorization: `Bearer ${key}`, "content-type": "application/json" },
      body: JSON.stringify({
        model: MODEL,
        input: inputs,
        input_type: inputType,
        encoding_format: "float",
        truncate: "END",
      }),
    });

    if (response.ok) {
      return toVectors((await response.json()) as EmbeddingResponse, inputs.length);
    }

    const retryable = response.status === 429 || response.status >= 500;
    if (!retryable || attempt >= 2) {
      throw new Error(`Embedding request failed with ${response.status}: ${await response.text()}`);
    }
    await new Promise((resolve) => setTimeout(resolve, 1000 * attempt));
  }
}

// The model returns 2048 numbers per text. Keeping the first 512 (a size the model supports) and rescaling
// to unit length matches the stored size.
function toVectors(response: EmbeddingResponse, expectedCount: number): number[][] {
  const rows = response.data;
  if (!Array.isArray(rows) || rows.length !== expectedCount) {
    throw new Error(`Embedding response has the wrong number of vectors`);
  }
  return [...rows]
    .sort((a, b) => a.index - b.index)
    .map((row) => {
      if (!Array.isArray(row.embedding) || row.embedding.length < EMBEDDING_DIMENSIONS) {
        throw new Error(`Embedding has the wrong dimension, expected ${EMBEDDING_DIMENSIONS}`);
      }
      return normalize(row.embedding.slice(0, EMBEDDING_DIMENSIONS));
    });
}

function normalize(vector: number[]): number[] {
  const length = Math.hypot(...vector);
  return vector.map((value) => value / length);
}
