import { EMBEDDING_DIMENSIONS } from "./db/schema";

const BATCH_SIZE = 32;
const DEFAULT_URL =
  "https://router.huggingface.co/hf-inference/models/BAAI/bge-small-en-v1.5/pipeline/feature-extraction";

export async function embedTexts(texts: string[]): Promise<number[][]> {
  const vectors: number[][] = [];
  for (let i = 0; i < texts.length; i += BATCH_SIZE) {
    vectors.push(...(await embedBatch(texts.slice(i, i + BATCH_SIZE))));
  }
  return vectors;
}

async function embedBatch(inputs: string[]): Promise<number[][]> {
  const url = process.env.HF_EMBEDDING_URL ?? DEFAULT_URL;
  const token = process.env.HF_TOKEN;
  if (!token) throw new Error("HF_TOKEN is not set");

  for (let attempt = 1; ; attempt++) {
    const response = await fetch(url, {
      method: "POST",
      headers: { authorization: `Bearer ${token}`, "content-type": "application/json" },
      body: JSON.stringify({ inputs, normalize: true }),
    });

    if (response.ok) {
      const vectors = (await response.json()) as unknown;
      assertVectors(vectors, inputs.length);
      return vectors;
    }

    const retryable = response.status === 429 || response.status >= 500;
    if (!retryable || attempt >= 2) {
      throw new Error(`Embedding request failed with ${response.status}: ${await response.text()}`);
    }
    await new Promise((resolve) => setTimeout(resolve, 1000 * attempt));
  }
}

function assertVectors(value: unknown, expectedCount: number): asserts value is number[][] {
  if (!Array.isArray(value) || value.length !== expectedCount) {
    throw new Error(`Embedding response has the wrong number of vectors`);
  }
  for (const vector of value) {
    if (!Array.isArray(vector) || vector.length !== EMBEDDING_DIMENSIONS) {
      throw new Error(`Embedding has the wrong dimension, expected ${EMBEDDING_DIMENSIONS}`);
    }
  }
}
