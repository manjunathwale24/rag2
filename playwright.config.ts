import { defineConfig, devices } from "@playwright/test";

const PORT = 3100;
const BLOB_STUB_URL = "http://localhost:4010";
const HF_STUB_URL = "http://localhost:4011";
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
        HF_TOKEN: "e2e-token",
        NVIDIA_API_KEY: "", // empty so E2E always uses the Hugging Face stub, even if .env.local has a key
        HF_EMBEDDING_URL: `${HF_STUB_URL}/embed`,
        HF_CHAT_URL: `${HF_STUB_URL}/chat`,
        BLOB_READ_WRITE_TOKEN: "vercel_blob_rw_e2estore_e2esecret",
        VERCEL_BLOB_API_URL: BLOB_STUB_URL,
        NEXT_PUBLIC_VERCEL_BLOB_API_URL: BLOB_STUB_URL,
      },
    },
  ],
});

