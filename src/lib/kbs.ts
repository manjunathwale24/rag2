export const DEFAULT_CHUNKING = {
  parentTokens: 1000,
  childTokens: 250,
  overlapTokens: 50,
} as const;

export function parseKbName(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const name = value.trim();
  return name.length > 0 && name.length <= 120 ? name : null;
}
