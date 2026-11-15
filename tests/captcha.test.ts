import { afterEach, beforeEach, describe, mock, test } from "node:test";
import assert from "node:assert/strict";
import { verifyCaptcha } from "../src/lib/captcha";

describe("verifyCaptcha", () => {
  beforeEach(() => {
    process.env.TURNSTILE_SECRET_KEY = "test-turnstile-secret";
    delete process.env.TURNSTILE_VERIFY_URL;
  });

  afterEach(() => {
    mock.restoreAll();
  });

  test("accepts a token that Turnstile verifies, sending the secret and the token", async () => {
    const fetchMock = mock.method(globalThis, "fetch", async () => Response.json({ success: true }));

    assert.equal(await verifyCaptcha("token-1"), true);
    const init = fetchMock.mock.calls[0].arguments[1] as RequestInit;
    assert.equal(String(init.body), "secret=test-turnstile-secret&response=token-1");
  });

  test("rejects a token that Turnstile does not verify", async () => {
    mock.method(globalThis, "fetch", async () => Response.json({ success: false }));

    assert.equal(await verifyCaptcha("token-1"), false);
  });

  test("rejects a missing token without calling Turnstile", async () => {
    const fetchMock = mock.method(globalThis, "fetch", async () => Response.json({ success: true }));

    assert.equal(await verifyCaptcha(undefined), false);
    assert.equal(fetchMock.mock.callCount(), 0);
  });

  test("fails loudly when the secret key is not configured", async () => {
    delete process.env.TURNSTILE_SECRET_KEY;

    await assert.rejects(verifyCaptcha("token-1"), /TURNSTILE_SECRET_KEY is not set/);
  });
});
