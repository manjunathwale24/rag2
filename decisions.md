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
| P6 | Answer generation uses NVIDIA's chat model (`google/gemma-4-31b-it`, see T14) to write the answer from retrieved passages. | Decided |

## Architecture

| # | Decision | Status |
|---|----------|--------|
| A1 | Framework: Next.js (App Router) with TypeScript, deployed on Vercel. | Decided |
| A2 | Database: Postgres with pgvector on Neon. Local dev uses `pgvector/pgvector:pg17` on port 5433. | Decided |
| A3 | Raw file storage: Vercel Blob (private access). Object keys are `kbs/{kbId}/...`. | Decided |
| A4 | Embeddings: superseded by T10 (NVIDIA). The original choice was Hugging Face `BAAI/bge-small-en-v1.5` at 384 dimensions. | Superseded (T10) |
| A5 | Endpoint URLs: superseded. Hugging Face URLs were removed. The NVIDIA URLs are in T8 and T10. | Superseded (T8, T10) |
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
| I7 | Uploads of 5 MB or less use one Blob PUT. Larger files use the multipart protocol. The threshold is `MULTIPART_THRESHOLD_BYTES` in `src/lib/upload-path.ts`. | Decided |
| I8 | Blob completion callbacks are not used. The browser registers each document through the API after upload, which works without a public callback URL in local development. | Decided |
| I9 | Chunk sizes: parents about 1000 tokens, children about 250 tokens, 50-token overlap. These are starting values, to be tuned later. | Decided |

## Tooling

| # | Decision | Status |
|---|----------|--------|
| T1 | npm registry: the global config points to an expired AWS CodeArtifact registry. A project-level `.npmrc` points to the public npm registry for this repo only. | Decided (user approved) |
| T2 | Tests use `node --import tsx --test`. `vitest` was dropped because of a peer conflict with `@types/node`. | Decided |
| T3 | Development follows TDD: write failing tests, then implement. | Decided |
| T4 | `next.config.ts` had `cacheComponents` and `partialPrefetching` from the scaffold. Removed. Every page is per-user and reads at request time, so prerendering with these flags only broke the build (`useParams` needs runtime data). | **Decided** |
| T5 | Git identity for commits: the `Copilot` identity is passed per command, so global config is unchanged. | Decided |
| T6 | E2E tests use local stubs for Vercel Blob (port 4010) and NVIDIA (port 4011), in `tests/e2e/stubs/`. The user has no real credentials yet. The stubs prove the app's code paths, not the real services. | Decided (user confirmed) |
| T8 | Chat provider: NVIDIA only. Answers use NVIDIA's OpenAI-compatible endpoint (`google/gemma-4-31b-it` by default, see T14, override with `NVIDIA_CHAT_MODEL`). Requires `NVIDIA_API_KEY`. The user asked to drop Hugging Face entirely, so there is no HF fallback. The key was pasted in chat before this change, so it was rotated first. | Decided (user chose this) |
| T9 | Database URL: the app reads `DATABASE_URL`, and falls back to `RAG_MNJ_DATABASE_URL` (created by the Neon Vercel integration) when it is unset. This avoids copying a secret that Vercel hides. The user approved deleting the broken placeholder `DATABASE_URL`. | Decided (user chose this) |
| T10 | Embeddings: NVIDIA `nvidia/nemotron-3-embed-1b` (replaced the retired `nvidia/llama-3.2-nv-embedqa-1b-v2` and `nvidia/llama-nemotron-embed-1b-v2`, see T13) at `https://integrate.api.nvidia.com/v1/embeddings`, using `NVIDIA_API_KEY`. Requests send `input_type` (`passage` when indexing, `query` when answering a question) and `truncate: END`. The model returns 2048 numbers. The app keeps the first 512 (a size NVIDIA documents) and rescales to unit length. The stored column is `vector(512)`. Unverified against the live API until the first real call. | Decided (user chose NVIDIA only) |
| T11 | Sign-up: `/signup` page and `POST /api/signup` create an account and sign the user in. The password must be at least 8 characters. Open sign-up has no email verification or rate limit (CAPTCHA is added in T12), so anyone can create an account and use NVIDIA quota. The user chose open sign-up. `npm run user:create` still works. | Decided (user chose this) |
| T12 | CAPTCHA: Cloudflare Turnstile on the login and sign-up forms, and the matching APIs. The API checks the token with Turnstile's `siteverify` before any database work, and returns 400 `CAPTCHA check failed. Please try again.` if it fails. Fails closed: a missing `TURNSTILE_SECRET_KEY` throws, so the APIs don't silently accept requests. Tokens are single-use, so the widget reloads after every failed attempt. Local dev uses Cloudflare's test keys. Production needs a real widget whose hostname list includes the Vercel domains. | Decided (user chose Turnstile for both sign-up and login) |
| T13 | Embedding model replaced twice, because NVIDIA retired each one. `nvidia/llama-3.2-nv-embedqa-1b-v2` ended on 2026-05-18 and `nvidia/llama-nemotron-embed-1b-v2` ended on 2026-08-25 (both HTTP 410 Gone). The app now uses `nvidia/nemotron-3-embed-1b`. Its docs list 512 and 1024 as truncated sizes, so the column moved from 384 to 512 (migration `0002_embedding_512`). Vectors from older models are not comparable, so any document synced before this change must be re-synced. Before choosing a model, check its end-of-life date, because NVIDIA retires them. | Decided (model retired by NVIDIA) |
| T14 | Chat model replaced, because NVIDIA retired `meta/llama-3.2-90b-vision-instruct` on 2026-11-16 (HTTP 410 Gone, so `/api/kbs/[id]/retrieve` returned 500). The default is now `google/gemma-4-31b-it`, a non-reasoning instruct model. Set `NVIDIA_CHAT_MODEL` to switch without a code change. Check the end-of-life date before choosing a model. | Decided (model retired by NVIDIA) |
 `npm run db:migrate` before `next build` (script `vercel-build`, set in `vercel.json`). A failing migration stops the deploy, so new code never runs against an unmigrated database. Migrations are reviewed in git before merge. | Decided (user chose this) |

## Open questions

1. **Embeddings:** the live NVIDIA embedding call (the 2048 to 512 truncation) is unverified. The first real upload and sync will confirm it.
2. **A3:** Does a private Vercel Blob store exist? Private access needs one.
