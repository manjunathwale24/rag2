import { handleUpload, type HandleUploadBody } from "@vercel/blob/client";
import { getUserFromRequest } from "../../../../src/lib/auth";
import { findOwnedKbId } from "../../../../src/lib/kbs";
import { ALLOWED_CONTENT_TYPES, MAX_UPLOAD_BYTES, isAllowedUploadPath } from "../../../../src/lib/upload";

/**
 * The browser uploads straight to Blob with a short-lived token, so 25 MB files never pass through this function.
 * The token is only issued to a signed-in user for a KB they own, at a path inside that KB.
 */
export async function POST(request: Request): Promise<Response> {
  const body = (await request.json().catch(() => null)) as HandleUploadBody | null;
  if (!body) return Response.json({ error: "Invalid body" }, { status: 400 });

  const user = await getUserFromRequest(request);
  if (body.type === "blob.generate-client-token" && !user) {
    return Response.json({ error: "Sign in required" }, { status: 401 });
  }

  try {
    const json = await handleUpload({
      body,
      request,
      onBeforeGenerateToken: async (pathname, clientPayload) => {
        const kbId = clientPayload ? (JSON.parse(clientPayload) as { kbId?: string }).kbId : undefined;
        const owned = kbId && user ? await findOwnedKbId(kbId, user.id) : null;
        if (!owned || !isAllowedUploadPath(owned, pathname)) {
          throw new Error("Upload is not allowed for this knowledge base");
        }
        return {
          allowedContentTypes: ALLOWED_CONTENT_TYPES,
          maximumSizeInBytes: MAX_UPLOAD_BYTES,
          addRandomSuffix: false,
        };
      },
      // The client registers the document after uploading (POST /api/kbs/<id>/documents). Blob's completion
      // callback would need a public URL, which local development doesn't have, so this route doesn't use it.
    });
    return Response.json(json);
  } catch (error) {
    return Response.json({ error: error instanceof Error ? error.message : "Upload failed" }, { status: 400 });
  }
}
