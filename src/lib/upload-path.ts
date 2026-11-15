/** Files above this size use the multipart upload protocol. Smaller files use one PUT request. */
export const MULTIPART_THRESHOLD_BYTES = 5 * 1024 * 1024;

/**
 * Builds a new upload path: `kbs/<kbId>/<uuid>/<filename>`.
 * Slashes are replaced so a filename can never add folders.
 * This file has no server-only imports, so the browser can use it too.
 */
export function buildUploadPathname(kbId: string, filename: string, uuid: string): string {
  return `kbs/${kbId}/${uuid}/${filename.replace(/[\\/]/g, "_")}`;
}
