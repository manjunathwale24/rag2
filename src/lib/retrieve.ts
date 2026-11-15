import { sql } from "drizzle-orm";
import { getDb } from "./db";
import { embedTexts } from "./embed";

export type ChildHit = {
  parentId: string;
  distance: number;
  childContent: string;
  parentContent: string;
  headingPath: string;
  filename: string;
};

export type RetrievedParent = {
  parentId: string;
  filename: string;
  headingPath: string;
  score: number;
  matchedText: string;
  text: string;
};

/** Keeps the nearest child per parent, so each parent section is returned once. */
export function rankParents(hits: ChildHit[], topK: number): RetrievedParent[] {
  const best = new Map<string, RetrievedParent>();
  for (const hit of [...hits].sort((a, b) => a.distance - b.distance)) {
    if (best.has(hit.parentId)) continue;
    best.set(hit.parentId, {
      parentId: hit.parentId,
      filename: hit.filename,
      headingPath: hit.headingPath,
      score: 1 - hit.distance,
      matchedText: hit.childContent,
      text: hit.parentContent,
    });
  }
  return [...best.values()].slice(0, topK);
}

type HitRow = {
  parent_id: string;
  child_content: string;
  parent_content: string;
  heading_path: string;
  filename: string;
  distance: number | string;
};

/** Vector search over child chunks, returning each matching parent once. */
export async function searchParents(kbId: string, queryVector: number[], topK: number): Promise<RetrievedParent[]> {
  const vectorLiteral = `[${queryVector.join(",")}]`;
  // Over-fetch child candidates so that deduplicating by parent still yields topK results.
  const candidateLimit = Math.min(topK * 5, 100);

  const rows = (await getDb().execute(sql`
    SELECT c.parent_id, c.content AS child_content, p.content AS parent_content,
           p.heading_path, d.filename,
           c.embedding <=> ${vectorLiteral}::vector AS distance
    FROM chunks c
    JOIN chunks p ON p.id = c.parent_id
    JOIN documents d ON d.id = c.document_id
    WHERE c.kb_id = ${kbId} AND c.level = 1 AND c.embedding IS NOT NULL
    ORDER BY distance
    LIMIT ${candidateLimit}
  `)) as unknown as HitRow[];

  return rankParents(
    rows.map((row) => ({
      parentId: row.parent_id,
      distance: Number(row.distance),
      childContent: row.child_content,
      parentContent: row.parent_content,
      headingPath: row.heading_path,
      filename: row.filename,
    })),
    topK,
  );
}

export async function retrieve(kbId: string, query: string, topK: number): Promise<RetrievedParent[]> {
  const [queryVector] = await embedTexts([query], "query");
  return searchParents(kbId, queryVector, topK);
}
