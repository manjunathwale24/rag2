import { defineConfig } from "drizzle-kit";
import { databaseUrlFromEnv } from "./src/lib/db/url";

export default defineConfig({
  dialect: "postgresql",
  schema: "./src/lib/db/schema.ts",
  out: "./drizzle",
  dbCredentials: {
    url: databaseUrlFromEnv(process.env) ?? "",
  },
});
