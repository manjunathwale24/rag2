import { get, list } from "@vercel/blob";

export type BlobEntry = { pathname: string; size: number };

export type Page<T> = { items: T[]; cursor?: string; hasMore: boolean };

export interface BlobStore {
  /** Lists every blob under `prefix`, following all pages. Throws if any page fails. */
  listAll(prefix: string): Promise<BlobEntry[]>;
  /** Reads a private blob fully into memory. */
  read(pathname: string): Promise<Uint8Array>;
}

/** Collects every page before returning, so a failure never yields a partial listing. */
export async function collectPages<T>(
  fetchPage: (cursor: string | undefined) => Promise<Page<T>>,
): Promise<T[]> {
  const items: T[] = [];
  let cursor: string | undefined;
  do {
    const page = await fetchPage(cursor);
    items.push(...page.items);
    cursor = page.hasMore ? page.cursor : undefined;
  } while (cursor !== undefined);
  return items;
}

export function vercelBlobStore(): BlobStore {
  return {
    async listAll(prefix) {
      return collectPages(async (cursor) => {
        const page = await list({ prefix, cursor, limit: 1000 });
        return {
          items: page.blobs.map((blob) => ({ pathname: blob.pathname, size: blob.size })),
          cursor: page.cursor,
          hasMore: page.hasMore,
        };
      });
    },
    async read(pathname) {
      const result = await get(pathname, { access: "private", useCache: false });
      if (!result || result.statusCode !== 200 || !result.stream) {
        throw new Error(`Blob not found: ${pathname}`);
      }
      return new Uint8Array(await new Response(result.stream).arrayBuffer());
    },
  };
}
