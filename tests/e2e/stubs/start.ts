import { BLOB_STUB_PORT, startBlobStub } from "./blob-stub";
import { NVIDIA_STUB_PORT, startNvidiaStub } from "./nvidia-stub";
import { TURNSTILE_STUB_PORT, startTurnstileStub } from "./turnstile-stub";

// Playwright starts this file before the app. It replaces Vercel Blob, NVIDIA, and Turnstile for E2E runs.
async function main(): Promise<void> {
  await Promise.all([startBlobStub(), startNvidiaStub(), startTurnstileStub()]);
  console.log(
    `E2E stubs ready: blob on ${BLOB_STUB_PORT}, NVIDIA on ${NVIDIA_STUB_PORT}, Turnstile on ${TURNSTILE_STUB_PORT}`,
  );
}

void main();
