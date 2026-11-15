import { after, beforeEach, describe, test } from "node:test";
import assert from "node:assert/strict";
import { closeDb, getDb, resetTestDatabase } from "./helpers/db";
import { users } from "../src/lib/db/schema";
import { verifyPassword } from "../src/lib/auth";
import { createUser } from "../src/lib/users";

describe("createUser", () => {
  beforeEach(async () => {
    await resetTestDatabase();
  });

  after(async () => {
    await closeDb();
  });

  test("stores a normalized email and a hash that verifies the password, never the password itself", async () => {
    await createUser({ email: "  Ana@Example.test ", password: "correct horse battery" });

    const [row] = await getDb().select().from(users);
    assert.equal(row.email, "ana@example.test");
    assert.notEqual(row.passwordHash, "correct horse battery");
    assert.equal(await verifyPassword("correct horse battery", row.passwordHash), true);
  });

  test("a second account with the same email is rejected", async () => {
    await createUser({ email: "ana@example.test", password: "correct horse battery" });

    await assert.rejects(createUser({ email: "ANA@example.test", password: "another password" }), /already exists/);
  });
});
