import { test, afterEach } from "node:test";
import assert from "node:assert/strict";
import { answerQuestion } from "../src/lib/answer";

process.env.NVIDIA_API_KEY = "nvapi-test";

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

test("with NVIDIA_API_KEY set, the chat goes to NVIDIA with its key and model", async () => {
  const saved = { key: process.env.NVIDIA_API_KEY, model: process.env.NVIDIA_CHAT_MODEL };
  process.env.NVIDIA_API_KEY = "nvapi-test";
  delete process.env.NVIDIA_CHAT_MODEL;
  const calls: { url: string; auth: string | null; model: string }[] = [];
  globalThis.fetch = (async (url: unknown, init?: RequestInit) => {
    const body = JSON.parse(String(init?.body)) as ChatBody;
    calls.push({
      url: String(url),
      auth: new Headers(init?.headers).get("authorization"),
      model: body.model,
    });
    return Response.json({ choices: [{ message: { content: "Yes [1]." } }] });
  }) as typeof fetch;
  try {
    const answer = await answerQuestion("Anything?", sources);
    assert.equal(answer, "Yes [1].");
    assert.equal(calls[0].url, "https://integrate.api.nvidia.com/v1/chat/completions");
    assert.equal(calls[0].auth, "Bearer nvapi-test");
    assert.equal(calls[0].model, "google/gemma-4-31b-it");
  } finally {
    restoreEnv("NVIDIA_API_KEY", saved.key);
    restoreEnv("NVIDIA_CHAT_MODEL", saved.model);
  }
});

test("without NVIDIA_API_KEY the answer fails before any request is sent", async () => {
  const saved = process.env.NVIDIA_API_KEY;
  delete process.env.NVIDIA_API_KEY;
  const bodies = mockChat("should never be used");
  try {
    await assert.rejects(answerQuestion("Anything?", sources), /NVIDIA_API_KEY/);
    assert.equal(bodies.length, 0);
  } finally {
    restoreEnv("NVIDIA_API_KEY", saved);
  }
});

function restoreEnv(name: string, value: string | undefined) {
  if (value === undefined) delete process.env[name];
  else process.env[name] = value;
}

test("when nothing was retrieved it says so and does not call the model", async () => {
  const bodies = mockChat("should never be used");

  const answer = await answerQuestion("Anything at all?", []);

  assert.match(answer, /couldn't find/i);
  assert.equal(bodies.length, 0);
});

test("only the best few sources go to the model, each trimmed around its matching passage", async () => {
  const bodies = mockChat("ok");
  const filler = "x".repeat(3000);
  const many = [
    { filename: "a.md", headingPath: "A", score: 0.5, matchedText: "NEEDLE", text: `${filler}NEEDLE${filler}` },
    { filename: "b.md", headingPath: "B", score: 0.48, text: "second" },
    { filename: "c.md", headingPath: "C", score: 0.45, text: "third" },
    { filename: "d.md", headingPath: "D", score: 0.44, text: "fourth" },
    { filename: "e.md", headingPath: "E", score: 0.1, text: "weak" },
  ];

  await answerQuestion("Where?", many);

  const userMessage = bodies[0].messages.at(-1)?.content ?? "";
  assert.match(userMessage, /NEEDLE/);
  assert.match(userMessage, /\[3\] c\.md/);
  assert.doesNotMatch(userMessage, /\[4\]/);
  assert.ok(userMessage.length < 2500, `prompt too long: ${userMessage.length}`);
});
