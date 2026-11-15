import { defineConfig, devices } from "@playwright/test";
import { E2E_TURNSTILE_SECRET } from "./tests/e2e/stubs/turnstile-stub";

const PORT = 3100;
const BLOB_STUB_URL = "http://localhost:4010";
const NVIDIA_STUB_URL = "http://localhost:4011";
const TURNSTILE_STUB_URL = "http://localhost:4012";
const TEST_DATABASE_URL =
  process.env.TEST_DATABASE_URL ?? "postgres://postgres:dev@localhost:5433/rag2_test";

export default defineConfig({
  testDir: "tests/e2e",
  globalSetup: "./tests/e2e/global-setup.ts",
  fullyParallel: false,
  workers: 1,
  reporter: [["list"]],
  use: {
    baseURL: `http://localhost:${PORT}`,
    trace: "retain-on-failure",
  },
  projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"] } }],
  webServer: [
    {
      command: "npx tsx tests/e2e/stubs/start.ts",
      url: `${BLOB_STUB_URL}/health`,
      reuseExistingServer: !process.env.CI,
      timeout: 60_000,
    },
    {
      command: `npm run build && npx next start -p ${PORT}`,
      url: `http://localhost:${PORT}/login`,
      reuseExistingServer: !process.env.CI,
      timeout: 240_000,
      env: {
        DATABASE_URL: TEST_DATABASE_URL,
        AUTH_SECRET: "e2e-only-secret-that-is-at-least-32-characters-long",
        NVIDIA_API_KEY: "e2e-nvidia-key",
        NVIDIA_EMBEDDING_URL: `${NVIDIA_STUB_URL}/v1/embeddings`,
        NVIDIA_CHAT_URL: `${NVIDIA_STUB_URL}/v1/chat/completions`,
        BLOB_READ_WRITE_TOKEN: "vercel_blob_rw_e2estore_e2esecret",
        VERCEL_BLOB_API_URL: BLOB_STUB_URL,
        NEXT_PUBLIC_VERCEL_BLOB_API_URL: BLOB_STUB_URL,
        TURNSTILE_SECRET_KEY: E2E_TURNSTILE_SECRET,
        TURNSTILE_VERIFY_URL: `${TURNSTILE_STUB_URL}/siteverify`,
        NEXT_PUBLIC_TURNSTILE_SITE_KEY: "e2e-site-key",
        NEXT_PUBLIC_TURNSTILE_SCRIPT_URL: `${TURNSTILE_STUB_URL}/api.js`,
      },
    },
  ],
});

