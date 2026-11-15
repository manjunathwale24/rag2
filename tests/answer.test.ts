import { test, afterEach } from "node:test";
import assert from "node:assert/strict";
import { answerQuestion } from "../src/lib/answer";

process.env.HF_TOKEN = "test-token";

type ChatBody = { model: string; messages: { role: string; content: string }[] };
const originalFetch = globalThis.fetch;

function mockChat(reply: string): ChatBody[] {
  const bodies: ChatBody[] = [];
  globalThis.fetch = (async (_url: unknown, init?: RequestInit) => {
    bodies.push(JSON.parse(String(init?.body)) as ChatBody);
    return Response.json({ choices: [{ message: { role: "assistant", content: reply } }] });
  }) as typeof fetch;
  return bodies;
}

afterEach(() => {
  globalThis.fetch = originalFetch;
});

const sources = [
  { filename: "guide.md", headingPath: "Guide > Install", text: "Run the installer to set up the app." },
  { filename: "faq.pdf", headingPath: "FAQ", text: "Support is available by email." },
];

test("the question and numbered sources go to the model, and its answer comes back", async () => {
  const bodies = mockChat("Run the installer [1].");

  const answer = await answerQuestion("How do I install?", sources);

  assert.equal(answer, "Run the installer [1].");
  const userMessage = bodies[0].messages.at(-1)?.content ?? "";
  assert.match(userMessage, /How do I install\?/);
  assert.match(userMessage, /\[1\][\s\S]*Run the installer to set up the app\./);
  assert.match(userMessage, /\[2\][\s\S]*Support is available by email\./);
});

test("when nothing was retrieved it says so and does not call the model", async () => {
  const bodies = mockChat("should never be used");

  const answer = await answerQuestion("Anything at all?", []);

  assert.match(answer, /couldn't find/i);
  assert.equal(bodies.length, 0);
});
