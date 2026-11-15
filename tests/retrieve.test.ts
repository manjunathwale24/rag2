import { test } from "node:test";
import assert from "node:assert/strict";
import { rankParents, type ChildHit } from "../src/lib/retrieve";

const hit = (parentId: string, distance: number, child: string): ChildHit => ({
  parentId,
  distance,
  childContent: child,
  parentContent: `parent of ${parentId}`,
  headingPath: `H ${parentId}`,
  filename: `${parentId}.md`,
});

test("several child hits from one parent collapse into a single result with the best score", () => {
  const hits = [hit("a", 0.1, "a1"), hit("b", 0.2, "b1"), hit("a", 0.3, "a2")];

  const results = rankParents(hits, 5);

  assert.deepEqual(
    results.map((r) => [r.parentId, r.matchedText, r.score]),
    [
      ["a", "a1", 0.9],
      ["b", "b1", 0.8],
    ],
  );
});

test("results are capped at topK and keep nearest-first order", () => {
  const hits = [hit("c", 0.05, "c"), hit("a", 0.1, "a"), hit("b", 0.2, "b")];

  assert.deepEqual(
    rankParents(hits, 2).map((r) => r.parentId),
    ["c", "a"],
  );
});
