import type { BlobEntry, BlobStore } from "../../src/lib/storage";

export type MemoryBlobStore = BlobStore & {
  files: Map<string, Uint8Array>;
  failListing: boolean;
};

export function memoryBlobStore(): MemoryBlobStore {
  const store: MemoryBlobStore = {
    files: new Map(),
    failListing: false,
    async listAll(prefix: string): Promise<BlobEntry[]> {
      if (store.failListing) throw new Error("listing unavailable");
      return [...store.files.entries()]
        .filter(([pathname]) => pathname.startsWith(prefix))
        .map(([pathname, bytes]) => ({ pathname, size: bytes.byteLength }));
    },
    async read(pathname: string): Promise<Uint8Array> {
      const bytes = store.files.get(pathname);
      if (!bytes) throw new Error(`Blob not found: ${pathname}`);
      return bytes;
    },
  };
  return store;
}
