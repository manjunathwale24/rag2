export type ChunkOptions = {
  parentTokens: number;
  childTokens: number;
  overlapTokens: number;
};

export type ParentChunk = {
  index: number;
  headingPath: string;
  content: string;
  tokenCount: number;
};

export type ChildChunk = {
  parentIndex: number;
  position: number;
  headingPath: string;
  content: string;
  tokenCount: number;
};

export type HierarchicalChunks = {
  parents: ParentChunk[];
  children: ChildChunk[];
};

const CHARS_PER_TOKEN = 4;
const HEADING = /^(#{1,6})\s+(.+?)\s*#*\s*$/;

export function approxTokens(text: string): number {
  return Math.ceil(text.length / CHARS_PER_TOKEN);
}

/**
 * Splits markdown-ish text into hierarchical chunks.
 * Parents follow heading sections (packed up to `parentTokens`) and never cross a heading boundary.
 * Children are overlapping windows inside a parent (`childTokens`, `overlapTokens`); only children get embedded.
 */
export function chunkHierarchically(text: string, options: ChunkOptions): HierarchicalChunks {
  const parentChars = options.parentTokens * CHARS_PER_TOKEN;
  const childChars = options.childTokens * CHARS_PER_TOKEN;
  const overlapChars = options.overlapTokens * CHARS_PER_TOKEN;

  const parents: ParentChunk[] = [];
  const children: ChildChunk[] = [];

  for (const block of toBlocks(text, parentChars)) {
    const last = parents[parents.length - 1];
    const joinedLength = last ? last.content.length + 2 + block.text.length : Infinity;
    if (last && last.headingPath === block.headingPath && joinedLength <= parentChars) {
      last.content = `${last.content}\n\n${block.text}`;
      last.tokenCount = approxTokens(last.content);
    } else {
      parents.push({
        index: parents.length,
        headingPath: block.headingPath,
        content: block.text,
        tokenCount: approxTokens(block.text),
      });
    }
  }

  for (const parent of parents) {
    for (const piece of windowText(parent.content, childChars, overlapChars)) {
      children.push({
        parentIndex: parent.index,
        position: children.length,
        headingPath: parent.headingPath,
        content: piece,
        tokenCount: approxTokens(piece),
      });
    }
  }

  return { parents, children };
}

type Block = { headingPath: string; text: string };

function toBlocks(text: string, maxChars: number): Block[] {
  const blocks: Block[] = [];
  const headings: { level: number; title: string }[] = [];
  let paragraph: string[] = [];

  const headingPath = () => headings.map((h) => h.title).join(" > ");
  const flush = () => {
    const body = paragraph.join("\n").trim();
    paragraph = [];
    if (!body) return;
    for (const piece of splitLong(body, maxChars)) {
      blocks.push({ headingPath: headingPath(), text: piece });
    }
  };

  for (const line of text.split(/\r?\n/)) {
    const heading = HEADING.exec(line);
    if (heading) {
      flush();
      const level = heading[1].length;
      while (headings.length && headings[headings.length - 1].level >= level) headings.pop();
      headings.push({ level, title: heading[2].trim() });
    } else if (line.trim() === "") {
      flush();
    } else {
      paragraph.push(line);
    }
  }
  flush();
  return blocks;
}

/** Splits text longer than `maxChars` at the last whitespace before the limit, or hard-splits if there is none. */
function splitLong(text: string, maxChars: number): string[] {
  const pieces: string[] = [];
  let rest = text.trim();
  while (rest.length > maxChars) {
    const ws = lastWhitespace(rest, maxChars, 1);
    const cut = ws === -1 ? maxChars : ws;
    pieces.push(rest.slice(0, cut).trim());
    rest = rest.slice(cut).trim();
  }
  if (rest) pieces.push(rest);
  return pieces;
}

function windowText(content: string, size: number, overlap: number): string[] {
  const pieces: string[] = [];
  let start = 0;
  while (start < content.length) {
    let end = Math.min(start + size, content.length);
    if (end < content.length) {
      const ws = lastWhitespace(content, end, start + Math.floor(size / 2));
      if (ws !== -1) end = ws;
    }
    const piece = content.slice(start, end).trim();
    if (piece) pieces.push(piece);
    if (end >= content.length) break;

    let next = end - overlap;
    if (next <= start) {
      next = end;
    } else {
      const ws = lastWhitespace(content, next - 1, start + 1);
      if (ws !== -1) next = ws + 1;
    }
    start = next;
  }
  return pieces;
}

/** Index of the last whitespace at or before `from`, not going below `min`. */
function lastWhitespace(text: string, from: number, min: number): number {
  for (let i = Math.min(from, text.length - 1); i >= Math.max(min, 0); i--) {
    if (/\s/.test(text[i])) return i;
  }
  return -1;
}
