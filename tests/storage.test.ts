import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { collectPages, type Page } from "../src/lib/storage";

describe("collectPages", () => {
  it("follows cursors across all pages and keeps the order", async () => {
    const pages: Record<string, Page<string>> = {
      start: { items: ["a", "b"], cursor: "c1", hasMore: true },
      c1: { items: ["c", "d"], cursor: "c2", hasMore: true },
      c2: { items: ["e"], hasMore: false },
    };
    const requested: (string | undefined)[] = [];

    const items = await collectPages(async (cursor) => {
      requested.push(cursor);
      return pages[cursor ?? "start"];
    });

    assert.deepEqual(items, ["a", "b", "c", "d", "e"]);
    assert.deepEqual(requested, [undefined, "c1", "c2"]);
  });

  it("returns nothing from a failed listing instead of a partial one", async () => {
    await assert.rejects(
      collectPages(async (cursor) => {
        if (cursor === undefined) return { items: ["a"], cursor: "next", hasMore: true };
        throw new Error("second page failed");
      }),
      /second page failed/,
    );
  });
});
