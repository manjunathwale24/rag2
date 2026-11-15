import { createHash, randomUUID } from "node:crypto";
import path from "node:path";
import { and, eq } from "drizzle-orm";
import { getDb } from "./db";
import { documents } from "./db/schema";
import { SUPPORTED_EXTENSIONS } from "./ingest/parse";
import type { BlobStore } from "./storage";

const MIME_TYPES: Record<string, string> = {
  ".pdf": "application/pdf",
  ".docx": "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  ".md": "text/markdown",
  ".markdown": "text/markdown",
  ".txt": "text/plain",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
};

/** Upload paths look like `kbs/<kbId>/<uuid>/<filename>`. */
export function isAllowedUploadPath(kbId: string, pathname: string): boolean {
  const prefix = `kbs/${kbId}/`;
  if (!pathname.startsWith(prefix)) return false;
  const parts = pathname.slice(prefix.length).split("/");
  if (parts.length !== 2 || parts.some((part) => part === "" || part === "." || part === "..")) return false;
  return SUPPORTED_EXTENSIONS.includes(path.extname(parts[1]).toLowerCase());
}

/** Builds a new upload path. Slashes are replaced so a filename can never add folders. */
export function buildUploadPathname(kbId: string, filename: string, uuid: string = randomUUID()): string {
  return `kbs/${kbId}/${uuid}/${filename.replace(/[\\/]/g, "_")}`;
}

export const ALLOWED_CONTENT_TYPES = [...new Set(Object.values(MIME_TYPES))];
export const MAX_UPLOAD_BYTES = 25 * 1024 * 1024;

/** Records an uploaded blob as a pending document. Registering the same path again returns the existing row. */
export async function registerDocument(input: { kbId: string; pathname: string; store: BlobStore }) {
  const { kbId, pathname, store } = input;
  if (!isAllowedUploadPath(kbId, pathname)) throw new Error(`Upload path not allowed: ${pathname}`);

  const bytes = await store.read(pathname);
  const filename = pathname.split("/").at(-1) ?? pathname;
  const db = getDb();

  const [inserted] = await db
    .insert(documents)
    .values({
      kbId,
      pathname,
      filename,
      mimeType: MIME_TYPES[path.extname(filename).toLowerCase()],
      sizeBytes: bytes.byteLength,
      sha256: createHash("sha256").update(bytes).digest("hex"),
    })
    .onConflictDoNothing({ target: [documents.kbId, documents.pathname] })
    .returning();
  if (inserted) return inserted;

  const [existing] = await db
    .select()
    .from(documents)
    .where(and(eq(documents.kbId, kbId), eq(documents.pathname, pathname)));
  return existing;
}
