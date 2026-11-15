import { describe, test } from "node:test";
import assert from "node:assert/strict";
import { databaseUrlFromEnv } from "../src/lib/db/url";

describe("databaseUrlFromEnv", () => {
  test("prefers DATABASE_URL when it is set", () => {
    assert.equal(
      databaseUrlFromEnv({ DATABASE_URL: "postgres://a", RAG_MNJ_DATABASE_URL: "postgres://b" }),
      "postgres://a",
    );
  });

  test("falls back to the Neon integration's RAG_MNJ_DATABASE_URL", () => {
    assert.equal(databaseUrlFromEnv({ RAG_MNJ_DATABASE_URL: "postgres://b" }), "postgres://b");
  });

  test("returns undefined when neither variable is set", () => {
    assert.equal(databaseUrlFromEnv({}), undefined);
  });
});
