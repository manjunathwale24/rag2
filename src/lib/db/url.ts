/**
 * DATABASE_URL is the app's name. The Neon Vercel integration creates RAG_MNJ_DATABASE_URL
 * instead, so accept that as a fallback.
 */
export function databaseUrlFromEnv(env: Record<string, string | undefined>): string | undefined {
  return env.DATABASE_URL || env.RAG_MNJ_DATABASE_URL || undefined;
}
