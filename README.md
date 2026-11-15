# RAG2: chat with your documents

A small, open-source RAG (retrieval-augmented generation) web app. Sign in, create a knowledge base, upload a PDF, DOCX, Markdown, text, or image file (up to 25 MB), sync it, and ask questions. Answers cite the passages they came from.

## How it works (the short version)

1. **Upload.** The browser sends the file straight to Vercel Blob, a file store, so large files never pass through a serverless function.
2. **Sync.** The server reads the file, splits it into *chunks* (sections of text), and turns each chunk into an *embedding*: a list of 384 numbers that captures its meaning. Chunks are stored in Postgres with the pgvector extension.
3. **Ask.** Your question is turned into an embedding too. The database finds the chunks whose embeddings are closest to it. A chat model writes the answer using only those chunks and cites them.

Chunking is *hierarchical*: each section (a "parent") is split into smaller overlapping pieces (the "children"). Search runs over the small children for precision, and the answer is built from the larger parent so it has enough context.

## Stack

- Next.js 16 (App Router) and TypeScript, deployed on Vercel
- Postgres with pgvector: Docker locally, Neon in production
- Vercel Blob (private) for the uploaded files
- Hugging Face for embeddings and the chat model
- Email and password login with a signed JWT cookie
- Tests: `node:test` for unit tests, Playwright for end-to-end (E2E) tests

The design decisions are recorded in [decisions.md](decisions.md).

## Getting started locally

You need Node.js 20.9 or newer and Docker.

1. **Start Postgres with pgvector.** The data lives in a named Docker volume, so it survives container restarts and removal:

   ```bash
   docker run -d --name rag2-pg -e POSTGRES_PASSWORD=dev -e POSTGRES_DB=rag2 \
     -p 5433:5432 -v rag2-pgdata:/var/lib/postgresql/data pgvector/pgvector:pg17
   ```

   Also create the test database once: `docker exec rag2-pg psql -U postgres -c "CREATE DATABASE rag2_test"`.

2. **Install dependencies:** `npm install`

3. **Create `.env.local`** by copying [.env.example](.env.example). Set `AUTH_SECRET` to at least 32 random characters, for example `openssl rand -base64 48`. The Blob and Hugging Face values are only needed for real uploads and answers, not for the E2E tests.

4. **Apply the database migrations:** `npm run db:migrate`

5. **Create a user.** There is no sign-up page, so accounts are created from the command line:

   ```bash
   npm run user:create -- you@example.com "a long password"
   ```

6. **Run the app:** `npm run dev`, then open http://localhost:3000.

### Database changes

Schema changes go through migration files only. Edit [src/lib/db/schema.ts](src/lib/db/schema.ts), run `npm run db:generate` to create a migration in [drizzle/](drizzle/), review it, then run `npm run db:migrate`. Never run `drizzle-kit push`: it can drop data without warning.

## Environment variables

| Variable | Used for |
|----------|----------|
| `DATABASE_URL` | Postgres connection string |
| `AUTH_SECRET` | Signs login tokens. At least 32 characters. |
| `BLOB_READ_WRITE_TOKEN` | Private Vercel Blob store for uploads |
| `HF_TOKEN` | Hugging Face token for embeddings and chat |
| `HF_EMBEDDING_URL`, `HF_CHAT_URL`, `HF_CHAT_MODEL` | Optional overrides. The E2E tests point these at local stubs. |

## API

All routes except `POST /api/login` need a signed-in user. Send the cookie from login, or an `Authorization: Bearer <token>` header.

| Method and path | Body | Purpose |
|-----------------|------|---------|
| `POST /api/login` | `{ "email", "password" }` | Sign in. Sets the cookie and returns the token. |
| `POST /api/logout` | none | Clears the cookie. |
| `GET /api/kbs` | none | List your knowledge bases. |
| `POST /api/kbs` | `{ "name" }` | Create a knowledge base. |
| `GET /api/kbs/{id}/documents` | none | List documents and their status (`pending`, `indexed`, `failed`). |
| `POST /api/kbs/{id}/documents` | `{ "pathname" }` | Register a file after it reached Blob. |
| `POST /api/kbs/{id}/sync` | none | Index pending documents. Returns `remaining`. Call again while `remaining > 0`. |
| `POST /api/kbs/{id}/retrieve` | `{ "question" }` | Return the answer and its sources. |
| `POST /api/blob/upload` | Vercel Blob client token request | Issues the upload token used by the browser. |

A knowledge base you do not own returns 404.

## Tests

- Unit tests: `npm test`
- E2E tests: `npm run test:e2e`. Playwright starts local stubs for Vercel Blob (port 4010) and Hugging Face (port 4011), builds the app, and runs it on port 3100. It uses the `rag2_test` database and resets it on every run. Install the browser once with `npx playwright install chromium`.
- Types and lint: `npx tsc --noEmit` and `npm run lint`

## Deploying

The app is not deployed yet. The plan:

1. Create a Neon Postgres database and enable the `vector` extension.
2. Create a private Vercel Blob store.
3. Set the environment variables above in Vercel, with `DATABASE_URL` pointing at Neon and a real `AUTH_SECRET`.
4. Set the Vercel build command to use `vercel.json` (already set). Each build runs `npm run db:migrate` against `DATABASE_URL` before `next build`. If a migration fails, the deploy fails.
5. Create users with `npm run user:create` against the production database.

5. Create users with `npm run user:create` against the production database.

