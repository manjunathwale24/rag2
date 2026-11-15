import { test } from "node:test";
import assert from "node:assert/strict";
import { htmlToMarkdown, parseDocument } from "../src/lib/ingest/parse";

const encode = (text: string) => new TextEncoder().encode(text);

test("markdown and plain text are returned unchanged", async () => {
  assert.equal(await parseDocument("notes.md", encode("# Title\n\nBody")), "# Title\n\nBody");
  assert.equal(await parseDocument("notes.txt", encode("plain words")), "plain words");
});

test("html headings become markdown headings and entities are decoded", () => {
  const html = "<h1>Setup</h1><p>Install &amp; run</p><h2>Usage</h2><p>Call it</p>";

  assert.equal(htmlToMarkdown(html), "# Setup\n\nInstall & run\n\n## Usage\n\nCall it");
});

test("unsupported file types are rejected", async () => {
  await assert.rejects(parseDocument("archive.zip", encode("x")), /Unsupported file type/);
});

test("documents without extractable text are rejected", async () => {
  await assert.rejects(parseDocument("blank.txt", encode("   \n  ")), /No text/);
});
