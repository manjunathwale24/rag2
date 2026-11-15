import { test, afterEach } from "node:test";
import assert from "node:assert/strict";
import { embedTexts } from "../src/lib/embed";
import { EMBEDDING_DIMENSIONS } from "../src/lib/db/schema";

process.env.NVIDIA_API_KEY = "nvapi-test";

type Body = { input: string[]; input_type: string; model: string; truncate: string };
const RAW_DIMENSIONS = 2048;
const originalFetch = globalThis.fetch;

function mockFetch(respond: (body: Body, call: number) => Response): Body[] {
  const bodies: Body[] = [];
  globalThis.fetch = (async (_url: unknown, init?: RequestInit) => {
    const body = JSON.parse(String(init?.body)) as Body;
    bodies.push(body);
    return respond(body, bodies.length);
  }) as typeof fetch;
  return bodies;
}

// A raw model vector: the first two values are [seed, 1], the rest are zero.
function rawVectorFor(seed: number): number[] {
  return Array.from({ length: RAW_DIMENSIONS }, (_, i) => (i === 0 ? seed : i === 1 ? 1 : 0));
}

function okWith(vectorFor: (input: string) => number[]) {
  return (body: Body) =>
    Response.json({
      object: "list",
      // Returned in reverse order on purpose; the client must sort by index.
      data: body.input
        .map((input, index) => ({ object: "embedding", index, embedding: vectorFor(input) }))
        .reverse(),
    });
}

afterEach(() => {
  globalThis.fetch = originalFetch;
});

test("long inputs are sent in batches of 32 and results keep their order", async () => {
  const texts = Array.from({ length: 70 }, (_, i) => `${i}`);
  const bodies = mockFetch(okWith((input) => rawVectorFor(Number(input))));

  const vectors = await embedTexts(texts);

  assert.deepEqual(bodies.map((b) => b.input.length), [32, 32, 6]);
  assert.equal(vectors.length, 70);
  texts.forEach((text, i) => {
    const seed = Number(text);
    assert.ok(Math.abs(vectors[i][0] - seed / Math.hypot(seed, 1)) < 1e-9);
  });
});

test("passages are embedded by default and queries are marked as queries", async () => {
  const bodies = mockFetch(okWith(() => rawVectorFor(1)));

  await embedTexts(["a passage"]);
  await embedTexts(["a question"], "query");

  assert.equal(bodies[0].input_type, "passage");
  assert.equal(bodies[0].model, "nvidia/nemotron-3-embed-1b");
  assert.equal(bodies[0].truncate, "END");
  assert.equal(bodies[1].input_type, "query");
});

test("raw vectors are cut to the stored size and scaled to unit length", async () => {
  mockFetch(okWith(() => rawVectorFor(3)));

  const [vector] = await embedTexts(["hello"]);

  assert.equal(vector.length, EMBEDDING_DIMENSIONS);
  const length = Math.hypot(...vector);
  assert.ok(Math.abs(length - 1) < 1e-9, `expected unit length, got ${length}`);
});

test("vectors shorter than the stored size are rejected", async () => {
  mockFetch(() => Response.json({ data: [{ index: 0, embedding: [1, 2, 3] }] }));

  await assert.rejects(embedTexts(["hello"]), /dimension/i);
});

test("a server error is retried once and then succeeds", async () => {
  const bodies = mockFetch((body, call) =>
    call === 1 ? new Response("busy", { status: 503 }) : okWith(() => rawVectorFor(1))(body)
  );

  const vectors = await embedTexts(["hello"]);

  assert.equal(bodies.length, 2);
  assert.equal(vectors.length, 1);
});

test("client errors are not retried", async () => {
  const bodies = mockFetch(() => new Response("unauthorized", { status: 401 }));

  await assert.rejects(embedTexts(["hello"]), /401/);
  assert.equal(bodies.length, 1);
});
