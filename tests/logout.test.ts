import { describe, test } from "node:test";
import assert from "node:assert/strict";
import { SESSION_COOKIE } from "../src/lib/auth";
import { POST } from "../app/api/logout/route";

describe("POST /api/logout", () => {
  test("clears the session cookie", async () => {
    const response = await POST();
    assert.equal(response.status, 200);
    const cookie = response.headers.get("set-cookie") ?? "";
    assert.match(cookie, new RegExp(`^${SESSION_COOKIE}=;`));
    assert.match(cookie, /Max-Age=0/);
  });
});
