import path from "node:path";

export const SUPPORTED_EXTENSIONS = [".pdf", ".docx", ".md", ".markdown", ".txt", ".png", ".jpg", ".jpeg"];

export async function parseDocument(filename: string, bytes: Uint8Array): Promise<string> {
  const extension = path.extname(filename).toLowerCase();
  let text: string;

  switch (extension) {
    case ".md":
    case ".markdown":
    case ".txt":
      text = new TextDecoder().decode(bytes);
      break;
    case ".pdf": {
      const { extractText } = await import("unpdf");
      const result = await extractText(bytes, { mergePages: true });
      text = String(result.text);
      break;
    }
    case ".docx": {
      const mammoth = await import("mammoth");
      const { value } = await mammoth.convertToHtml({ buffer: Buffer.from(bytes) });
      text = htmlToMarkdown(value);
      break;
    }
    case ".png":
    case ".jpg":
    case ".jpeg":
      text = await ocrImage(bytes);
      break;
    default:
      throw new Error(`Unsupported file type: ${extension || filename}`);
  }

  const cleaned = text.trim();
  if (!cleaned) throw new Error(`No text could be extracted from ${filename}`);
  return cleaned;
}

/** Converts the HTML mammoth produces into markdown, keeping heading levels for chunking. */
export function htmlToMarkdown(html: string): string {
  const text = html
    .replace(/<h([1-6])[^>]*>([\s\S]*?)<\/h\1>/g, (_, level: string, inner: string) => {
      return `\n\n${"#".repeat(Number(level))} ${stripTags(inner)}\n\n`;
    })
    .replace(/<\/p>/g, "\n\n")
    .replace(/<br\s*\/?>/g, "\n");
  return decodeEntities(stripTags(text)).replace(/\n{3,}/g, "\n\n").trim();
}

function stripTags(html: string): string {
  return html.replace(/<[^>]+>/g, "");
}

function decodeEntities(text: string): string {
  return text
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&amp;/g, "&");
}

async function ocrImage(bytes: Uint8Array): Promise<string> {
  const { createWorker } = await import("tesseract.js");
  const worker = await createWorker("eng");
  try {
    const { data } = await worker.recognize(Buffer.from(bytes));
    return data.text;
  } finally {
    await worker.terminate();
  }
}
