import { test, afterEach } from "node:test";
import assert from "node:assert/strict";
import { embedTexts } from "../src/lib/embed";
import { EMBEDDING_DIMENSIONS } from "../src/lib/db/schema";

process.env.HF_TOKEN = "test-token";

type Body = { inputs: string[] };
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

function vectorFor(seed: number): number[] {
  return Array.from({ length: EMBEDDING_DIMENSIONS }, (_, i) => (i === 0 ? seed : 0));
}

afterEach(() => {
  globalThis.fetch = originalFetch;
});

test("long inputs are sent in batches of 32 and results keep their order", async () => {
  const texts = Array.from({ length: 70 }, (_, i) => `chunk ${i}`);
  const bodies = mockFetch((body) =>
    Response.json(body.inputs.map((_, i) => vectorFor(Number(body.inputs[i].split(" ")[1]))))
  );

  const vectors = await embedTexts(texts);

  assert.deepEqual(bodies.map((b) => b.inputs.length), [32, 32, 6]);
  assert.equal(vectors.length, 70);
  assert.deepEqual(vectors.map((v) => v[0]), texts.map((_, i) => i));
});

test("vectors with the wrong dimension are rejected", async () => {
  mockFetch(() => Response.json([[1, 2, 3]]));

  await assert.rejects(embedTexts(["hello"]), /dimension/i);
});

test("a server error is retried once and then succeeds", async () => {
  const bodies = mockFetch((body, call) =>
    call === 1
      ? new Response("busy", { status: 503 })
      : Response.json(body.inputs.map(() => vectorFor(1)))
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
