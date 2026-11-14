import { test } from "node:test";
import assert from "node:assert/strict";
import { chunkHierarchically } from "../src/lib/ingest/chunk";

const options = { parentTokens: 60, childTokens: 20, overlapTokens: 5 };

test("parents never cross heading boundaries and carry the heading path", () => {
  const text = [
    "# Guide",
    "Intro paragraph.",
    "## Setup",
    "Install the package.",
    "## Usage",
    "Call the function.",
  ].join("\n\n");

  const { parents } = chunkHierarchically(text, options);

  assert.deepEqual(
    parents.map((p) => [p.headingPath, p.content]),
    [
      ["Guide", "Intro paragraph."],
      ["Guide > Setup", "Install the package."],
      ["Guide > Usage", "Call the function."],
    ],
  );
});

test("children stay within their parent and respect the child size limit", () => {
  const sentence = "The retrieval pipeline splits documents into hierarchical chunks. ";
  const text = `# Long\n\n${sentence.repeat(20)}`;

  const { parents, children } = chunkHierarchically(text, options);

  assert.ok(children.length > parents.length, "expected more children than parents");
  for (const child of children) {
    assert.ok(child.content.length <= options.childTokens * 4, `child too long: ${child.content.length}`);
    assert.ok(parents[child.parentIndex].content.includes(child.content));
  }
});

test("consecutive children overlap when overlapTokens is set", () => {
  const words = Array.from({ length: 120 }, (_, i) => `word${i}`).join(" ");
  const { children } = chunkHierarchically(words, options);

  assert.ok(children.length > 2);
  for (let i = 1; i < children.length; i++) {
    if (children[i].parentIndex !== children[i - 1].parentIndex) continue;
    const previousTail = children[i - 1].content.split(" ").slice(-2);
    const currentHead = children[i].content.split(" ");
    assert.ok(
      previousTail.some((w) => currentHead.includes(w)),
      `children ${i - 1} and ${i} do not overlap`,
    );
  }
});

test("text without whitespace is hard-split without losing characters", () => {
  const blob = "x".repeat(500);
  const { parents, children } = chunkHierarchically(blob, options);

  assert.ok(parents.length > 1);
  assert.ok(children.every((c) => c.content.length <= options.childTokens * 4));
  assert.equal(parents.map((p) => p.content).join(""), blob);
});

test("empty input produces no chunks", () => {
  assert.deepEqual(chunkHierarchically("   \n\n  ", options), { parents: [], children: [] });
});
