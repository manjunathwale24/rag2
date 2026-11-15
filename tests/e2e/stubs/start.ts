import { BLOB_STUB_PORT, startBlobStub } from "./blob-stub";
import { NVIDIA_STUB_PORT, startNvidiaStub } from "./nvidia-stub";

// Playwright starts this file before the app. It replaces Vercel Blob and NVIDIA for E2E runs.
async function main(): Promise<void> {
  await Promise.all([startBlobStub(), startNvidiaStub()]);
  console.log(`E2E stubs ready: blob on ${BLOB_STUB_PORT}, NVIDIA on ${NVIDIA_STUB_PORT}`);
}

void main();
