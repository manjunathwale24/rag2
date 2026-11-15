# PRD: RAG2, chat with your documents

| | |
|---|---|
| Status | v1 deployed at https://rag2-omega.vercel.app |
| Owner | @manjunathwale24 |
| Last updated | 2026-11-15 |
| Related | [README.md](README.md) for setup and API, [decisions.md](decisions.md) for design decisions (IDs like T13 refer to it) |

## 1. Summary

RAG2 is a small, open-source web app for asking questions about your own documents. A signed-in user creates a knowledge base, uploads files, syncs them, and asks questions in plain language. Each answer is written from passages found in those documents and lists the sources it used.

It replaces an earlier, heavier AWS design (S3, DynamoDB, Secrets Manager, Bedrock Knowledge Base) with one that anyone can deploy on Vercel with a Postgres database (decision P1).

## 2. Problem

Language models don't know a user's private documents, and they can invent answers when asked about them. People who need answers from manuals, reports, or notes have to search by keyword and read long files themselves.

Existing RAG setups are often tied to a cloud vendor's managed service, which makes them costly to run, hard to understand, and hard to move.

## 3. Goals and non-goals

### Goals
- G1. A user can go from sign-up to a cited answer in one sitting, using only the web UI.
- G2. Answers are grounded in the user's documents and show where they came from.
- G3. Handle files up to 25 MB, including on a serverless platform with request-size and time limits.
- G4. One user can never read another user's documents or answers.
- G5. Simple enough to read, run locally, and deploy: one database, one file store, one model provider.
- G6. Data survives redeploys, and schema changes never lose data.

### Non-goals (v1)
- Chat history or multi-turn conversations. Each question is answered on its own.
- Team sharing, roles, or knowledge bases shared between users.
- OCR of images embedded inside PDFs or DOCX files (decision A6). Only standalone images are OCR'd.
- Email verification, password reset, or social login.
- Billing, quotas, or admin tools.
- Hybrid (keyword plus vector) search and reranking.
- Streaming answers.

## 4. Users

| User | Need |
|---|---|
| Individual knowledge worker or student | Ask questions about their own PDFs, Word files, notes, and scans without reading everything |
| Developer or evaluator | A small, readable RAG reference with a documented API, tests, and decisions |

## 5. User stories

1. As a new user, I can create an account and sign in, so my documents are private to me.
2. As a user, I can create a named knowledge base, so I can group related documents.
3. As a user, I can upload PDF, DOCX, Markdown, text, PNG, and JPG files up to 25 MB.
4. As a user, I can sync a knowledge base and see each document's status (`pending`, `indexed`, `failed`), so I know what's ready and why something failed.
5. As a user, I can ask a question and get an answer with the source passages (file and section), so I can check it.
6. As a user, if the documents don't contain the answer, I'm told so rather than given a guess.
7. As a developer, I can call the same features over a documented HTTP API.

## 6. Functional requirements

### 6.1 Accounts and sessions
- FR-1. Sign-up and login with email and password. Passwords are at least 8 characters and stored only as bcrypt hashes.
- FR-2. A successful login sets an httpOnly cookie with a signed token valid for 7 days. API clients can use `Authorization: Bearer <token>`.
- FR-3. Sign-up and login require a valid Cloudflare Turnstile token, checked on the server before any database work. If the CAPTCHA secret is missing, the request fails (fails closed).
- FR-4. A duplicate email on sign-up returns 409.

### 6.2 Knowledge bases
- FR-5. A user can create and list their own knowledge bases. Names are 1 to 120 characters.
- FR-6. A knowledge base owned by someone else behaves exactly like one that doesn't exist (404).

### 6.3 Upload
- FR-7. The browser uploads directly to private file storage with a short-lived, server-issued token. File bytes never pass through the app server.
- FR-8. Allowed types: PDF, DOCX, Markdown, plain text, PNG, JPG, JPEG. Maximum 25 MB.
- FR-9. Uploads go under `kbs/<kbId>/...`. The server rejects any other path, path traversal, or unsupported extension.
- FR-10. After upload, the browser registers the file with the API. Registering the same path twice returns the existing document. The file's size and SHA-256 hash are recorded.

### 6.4 Sync (indexing)
- FR-11. Sync reads each non-indexed document, extracts text (PDF text layer, DOCX, plain text, OCR for images), splits it into parent and child chunks, embeds the children, and marks the document `indexed`.
- FR-12. Chunking is hierarchical: parents follow heading sections (about 1000 tokens) and never cross a heading; children are overlapping windows (about 250 tokens, 50 overlap). Only children are embedded.
- FR-13. Sync does a bounded amount of work per call and returns how many documents remain. Work saved before a timeout is not lost, and the next call continues from it.
- FR-14. A document that fails is marked `failed` with the error text. Other documents continue. The next sync retries it.
- FR-15. Documents whose files no longer exist in storage are removed from the index, but only after a complete file listing succeeds.
- FR-16. A document with no extractable text fails with a clear message.

### 6.5 Retrieval and answers
- FR-17. A question is embedded as a query. The 5 closest passages in that knowledge base are found by vector search, returning each parent section once.
- FR-18. The answer is generated by a chat model instructed to use only the numbered sources, cite them, and say when the sources lack the answer.
- FR-19. If no passages are found, the app returns a fixed "couldn't find anything" message without calling the model.
- FR-20. The response contains the answer and, for each source: filename, heading path, score, and text.

## 7. API surface

See [README.md](README.md#api) for the full table. Required capabilities map to routes:

| Capability | Route |
|---|---|
| Login | `POST /api/login` (also `POST /api/signup`, `POST /api/logout`) |
| Create knowledge base | `POST /api/kbs` (and `GET /api/kbs`) |
| Upload and register | `POST /api/blob/upload`, `POST /api/kbs/{id}/documents` |
| Sync | `POST /api/kbs/{id}/sync` |
| Retrieve and answer | `POST /api/kbs/{id}/retrieve` |

## 8. Non-functional requirements

| Area | Requirement |
|---|---|
| Limits | 25 MB per file. Route time limit is 60 seconds on the Vercel Hobby plan, so large files need several sync calls (I6). |
| Security | Per-user isolation on every knowledge-base route. Secrets only in environment variables. Public variables hold public values only. No secrets in git. |
| Reliability | Sync is resumable and idempotent. Embedding calls retry once on 429 or 5xx, then fail the document with the error text. |
| Data safety | Schema changes only through reviewed migration files, run before each production build. Never use `drizzle-kit push`. |
| Testability | Unit tests and end-to-end tests run without paid services, using local stubs for file storage, the model provider, and the CAPTCHA. |
| Portability | Standard Postgres with the `vector` extension, one file store, one model provider. Model names and URLs are configurable. |

## 9. Data model

- `users`: email and password hash.
- `knowledge_bases`: owner, name, and chunk-size settings.
- `documents`: knowledge base, storage path, filename, type, size, SHA-256, status, error, timestamps.
- `chunks`: knowledge base, document, parent link, level (0 = parent, 1 = child), position, heading path, text, token count, `embedding vector(512)` on children, with an HNSW cosine index.

## 10. Dependencies and risks

| Risk | Impact | Mitigation |
|---|---|---|
| Model provider retires an embedding model (this happened twice, T13) | Sync fails with HTTP 410 and new vectors no longer match old ones | Check end-of-life dates before choosing a model; keep the model name in one place; re-sync documents after a change; monitor deprecation notices |
| Open sign-up (T11) | Anyone can create an account and use model quota | CAPTCHA now; add rate limits and quotas if abused |
| Serverless time limit | Large documents don't finish in one call | Resumable sync (FR-13) |
| Retrieval quality unmeasured | 512-dimension vectors may be less accurate than larger ones | Build an evaluation set and compare 512 and 1024 dimensions |
| Scanned PDFs have no text layer | Document fails to index | Planned: OCR fallback for pages without text |
| Third-party services (Vercel, Neon, Blob, NVIDIA, Cloudflare) | Outages or policy changes affect the app | Configurable endpoints; stubs in tests; clear error messages |

## 11. Success metrics

No usage data exists yet, so these are the measures to start collecting. None has a target until a baseline is measured.

- Sync success rate: share of uploaded documents that reach `indexed`.
- Time to first answer: from sign-up to the first answer with sources.
- Retrieval quality: on a small question set per sample document, how often the right passage is in the top 5.
- Answer grounding: how often an answer's citations support what it says (manual review at first).
- Abuse: sign-ups per day and failed CAPTCHA rate.

## 12. Release status (as of 2026-11-15)

**Done and verified**
- All requirements in section 6 are implemented.
- 72 unit tests and 6 Playwright end-to-end tests pass against local stubs.
- Deployed to production, with database migrations applied during the build.

**Not yet verified**
- A live call to the current embedding model with a real key, and a full production sync and question on a real file.
- Large multipart uploads, OCR cold starts on Vercel, and sync time for a 25 MB file.
- Retrieval quality at 512 dimensions.

## 13. Open questions

1. Does the 2048-to-512 truncation give acceptable retrieval quality? (needs the evaluation set)
2. What is the end-of-life date of `nvidia/nemotron-3-embed-1b`, and how will the team be alerted before it?
3. Should sign-up stay open, or move to invite-only or email verification?
4. Is the Hobby-plan 60-second limit acceptable, or should sync move to a background queue?

## 14. Future work

- Evaluation set and quality dashboard.
- OCR fallback for scanned PDFs, and OCR of images inside documents.
- Hybrid search and reranking.
- Multi-turn chat with history.
- Rate limiting, quotas, and email verification.
- Background sync queue and progress updates.
- Streaming answers.
