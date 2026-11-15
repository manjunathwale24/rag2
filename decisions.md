# Decisions

Architecture and product decisions for the RAG app. Status is one of: **Decided**, **Open**, or **Superseded**.

## Product

| # | Decision | Status |
|---|----------|--------|
| P1 | Build an open-source, simpler RAG app that deploys on Vercel, replacing the earlier AWS design (S3, DynamoDB, Secrets Manager, Bedrock Knowledge Base). | Decided |
| P2 | Supported inputs: PDF, DOCX, Markdown, plain text, and standalone images (PNG, JPG, JPEG). | Decided |
| P3 | Users upload files up to **25 MB** through a web UI and ask questions about them. | Decided |
| P4 | Data must not be lost across deployments. Schema changes go through drizzle migration files only. The local Postgres uses a named Docker volume. | Decided |
| P5 | APIs: login, create knowledge base (KB), upload document, sync KB, retrieve. | Decided |
| P6 | Answer generation uses a Hugging Face chat model that writes the answer from retrieved passages. | Decided |

## Architecture

| # | Decision | Status |
|---|----------|--------|
| A1 | Framework: Next.js (App Router) with TypeScript, deployed on Vercel. | Decided |
| A2 | Database: Postgres with pgvector on Neon. Local dev uses `pgvector/pgvector:pg17` on port 5433. | Decided |
| A3 | Raw file storage: Vercel Blob (private access). Object keys are `kbs/{kbId}/...`. | Decided |
| A4 | Embeddings: Hugging Face hosted `BAAI/bge-small-en-v1.5`, 384 dimensions. Endpoint is set by the `HF_EMBEDDING_URL` env var. | Decided |
| A5 | Endpoint URL: the default in code is a best guess and is **not verified**. | **Open** |
| A6 | OCR: `tesseract.js` runs on standalone images only. Images embedded in PDFs and DOCX files are not OCR'd in v1. | Decided |
| A7 | Hierarchical chunking. Parents follow heading sections and never cross a heading. Children are overlapping windows inside a parent. Only children are embedded. Retrieval returns the parent text. | Decided |
| A8 | Token count is approximated as characters / 4. | Decided |

## Auth

| # | Decision | Status |
|---|----------|--------|
| U1 | Email and password login. | Decided |
| U2 | Custom `POST /api/login` with bcrypt and a `jose` HS256 JWT (7-day expiry). The token is set in an httpOnly cookie and returned in JSON for API clients. Bearer auth is also accepted. | Decided |
| U3 | This replaces the Auth.js credentials provider from the original design, because it fits the `/api/login` shape better. | Decided |

## Ingestion and sync

| # | Decision | Status |
|---|----------|--------|
| I1 | Upload path for files up to 25 MB: the browser uploads directly to Vercel Blob using a server-issued token, then registers the file with the API. This avoids the roughly 4.5 MB serverless request-body limit. | Decided (supersedes the earlier 4 MB cap) |
| I2 | Sync is resumable. Each run does a bounded amount of work and returns `remaining`. Parse and chunk results are saved before embedding, so a timeout does not lose work. | Decided |
| I3 | Sync deletes database rows for blobs that are gone only after a complete, paginated Blob listing succeeds. A partial listing never deletes data. | Decided |
| I4 | A document with an error gets status `failed` with the error message. It is not retried silently. | Decided |
| I5 | Upload status: a document is `pending` if its sha256 changed or it is not `indexed`. Otherwise it is left alone. | Decided |
| I6 | Vercel Hobby plan, so the route time limit is 60 seconds. Large PDFs need several sync calls. The resumable design in I2 handles this. | Decided |

## Tooling

| # | Decision | Status |
|---|----------|--------|
| T1 | npm registry: the global config points to an expired AWS CodeArtifact registry. A project-level `.npmrc` points to the public npm registry for this repo only. | Decided (user approved) |
| T2 | Tests use `node --import tsx --test`. `vitest` was dropped because of a peer conflict with `@types/node`. | Decided |
| T3 | Development follows TDD: write failing tests, then implement. | Decided |
| T4 | `next.config.ts` still has `cacheComponents` and `partialPrefetching` from the scaffold. Remove them unless they are needed. | **Open** |
| T5 | Git identity for commits: the `Copilot` identity is passed per command, so global config is unchanged. | Decided |

## Open questions

1. **A5:** The Hugging Face embedding endpoint URL is still unverified. Paste the exact URL, or test later with a token.
2. **A3:** Does a private Vercel Blob store exist? Private access needs one.
3. **T4:** Remove `cacheComponents` and `partialPrefetching` from `next.config.ts`? (Proposed: yes.)
