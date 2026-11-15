import { createServer, type Server } from "node:http";
import { readBody, sendEmpty, sendJson } from "./http";

export const BLOB_STUB_PORT = 4010;

type StoredBlob = { pathname: string; bytes: Buffer; contentType: string; uploadedAt: string };

/** Keeps uploaded files in memory and serves them back, like Vercel Blob does for the app's code paths. */
export function startBlobStub(port = BLOB_STUB_PORT): Promise<Server> {
  const blobs = new Map<string, StoredBlob>();
  const base = `http://localhost:${port}`;

  const blobUrl = (pathname: string) => `${base}/blobs/${encodeURI(pathname)}`;

  const server = createServer(async (req, res) => {
    if (req.method === "OPTIONS") return sendEmpty(res, 204);

    const url = new URL(req.url ?? "/", base);
    if (url.pathname === "/health") return sendJson(res, 200, { ok: true });

    if (url.pathname === "/" && req.method === "PUT") {
      const pathname = url.searchParams.get("pathname");
      if (!pathname) return sendJson(res, 400, { error: "pathname is required" });
      const contentType = String(req.headers["x-content-type"] ?? "application/octet-stream");
      const blob = { pathname, bytes: await readBody(req), contentType, uploadedAt: new Date().toISOString() };
      blobs.set(pathname, blob);
      return sendJson(res, 200, {
        url: blobUrl(pathname),
        downloadUrl: `${blobUrl(pathname)}?download=1`,
        pathname,
        contentType,
        contentDisposition: `inline; filename="${pathname.split("/").at(-1)}"`,
      });
    }

    if (url.pathname === "/" && req.method === "GET") {
      const prefix = url.searchParams.get("prefix") ?? "";
      const matches = [...blobs.values()]
        .filter((blob) => blob.pathname.startsWith(prefix))
        .map((blob) => ({
          url: blobUrl(blob.pathname),
          downloadUrl: `${blobUrl(blob.pathname)}?download=1`,
          pathname: blob.pathname,
          size: blob.bytes.byteLength,
          uploadedAt: blob.uploadedAt,
        }));
      return sendJson(res, 200, { blobs: matches, cursor: undefined, hasMore: false });
    }

    if (url.pathname.startsWith("/blobs/") && req.method === "GET") {
      const pathname = decodeURI(url.pathname.slice("/blobs/".length));
      const blob = blobs.get(pathname);
      if (!blob) return sendJson(res, 404, { error: "not found" });
      res.writeHead(200, { "content-type": blob.contentType, "access-control-allow-origin": "*" });
      return res.end(blob.bytes);
    }

    sendJson(res, 404, { error: `no stub route for ${req.method} ${url.pathname}` });
  });

  return new Promise((resolve) => server.listen(port, () => resolve(server)));
}
