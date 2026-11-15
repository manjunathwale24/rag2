import { BLOB_STUB_PORT, startBlobStub } from "./blob-stub";
import { HF_STUB_PORT, startHfStub } from "./hf-stub";

// Playwright starts this file before the app. It replaces Vercel Blob and Hugging Face for E2E runs.
async function main(): Promise<void> {
  await Promise.all([startBlobStub(), startHfStub()]);
  console.log(`E2E stubs ready: blob on ${BLOB_STUB_PORT}, Hugging Face on ${HF_STUB_PORT}`);
}

void main();
