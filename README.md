# taxPOD CRM with Tax Document Q&A (RAG)

A lightweight CRM (contacts, opportunities, dashboard) with a retrieval-augmented Q&A assistant over public Malaysian tax documents.

- **Stack:** TypeScript, Next.js (App Router), Supabase Postgres with pgvector, Google Gemini
- **Design and decisions:** see [ARCHITECTURE.md](./ARCHITECTURE.md)
- **How AI tools were used:** see [AI_USAGE.md](./AI_USAGE.md)

## What is in the app

| Page | What it does |
|---|---|
| `/` Dashboard | Total contacts, open opportunities, total opportunity value (RM), recent activity feed |
| `/contacts` | Create, view, edit, delete contacts. Search by name, email, phone or company. Filter by status (Lead / Prospect / Customer) |
| `/opportunities` | Kanban board grouped by stage (New → Contacted → Qualified → Proposal → Won / Lost). Each opportunity belongs to a contact. Drag a card or use its dropdown to change stage |
| `/assistant` | Tax Assistant: ask a question, get an answer with document and page citations, or a clear "not found" |

## Prerequisites

- Node.js 20 or newer
- A Supabase project (the free tier is enough): https://supabase.com
- A Google Gemini API key (free tier): https://aistudio.google.com/apikey

## Run it locally

### 1. Install

```bash
npm install
```

### 2. Configure environment variables

```bash
cp .env.example .env.local
```

Fill in `.env.local`:

| Variable | Where to find it |
|---|---|
| `SUPABASE_URL` | Supabase dashboard → Project Settings → API → Project URL |
| `SUPABASE_SERVICE_ROLE_KEY` | Same page → the `service_role` (or "secret") key. Server-side only, never exposed to the browser |
| `GEMINI_API_KEY` | Google AI Studio → API keys |
| `GEMINI_CHAT_MODEL`, `GEMINI_EMBED_MODEL` | Model IDs. Check them in step 4 |
| `GEMINI_RERANK_MODEL` | Optional. A lighter model for reranking (for example a Flash-Lite model). Leave empty to use the chat model |

### 3. Create the database schema

Open the Supabase dashboard → SQL Editor, paste the contents of [`supabase/schema.sql`](./supabase/schema.sql) and run it. This creates the CRM tables, the pgvector tables, the HNSW index and the `match_chunks` search function.

Optional: run [`supabase/seed.sql`](./supabase/seed.sql) the same way to load a few fictional contacts and opportunities.

### 4. Check the Gemini model IDs

```bash
npm run models
```

This lists the chat and embedding models your key can use and tells you whether the two configured in `.env.local` are available. If one says `NOT AVAILABLE`, set it to an ID from the list. The embedding model must support 768-dimension output (`gemini-embedding-001` does).

### 5. Ingest the tax documents

```bash
npm run ingest
```

For each document in [`scripts/documents.ts`](./scripts/documents.ts) this downloads the PDF into `data/docs/`, extracts the text page by page, chunks it, embeds the chunks with Gemini and stores them in Supabase. It prints progress and finishes with the document and chunk counts.

- It is safe to re-run. Documents already ingested are skipped.
- `npm run ingest -- --force` re-ingests everything. `npm run ingest -- --only <slug>` does one document.
- It is deliberately paced for the free tier, so the larger guidelines take a few minutes each.
- **If a download fails** (government sites sometimes block scripted downloads), the error message gives the URL. Open it in a browser, save the PDF as `data/docs/<slug>.pdf`, and re-run.

### 6. Start the app

```bash
npm run dev
```

Open http://localhost:3000.

## Using the RAG module

1. Go to **Tax Assistant** (`/assistant`). The right-hand panel lists the ingested documents.
2. Type a question, for example *"How long does a buyer have to reject a validated e-Invoice?"*, and press **Ask**.
3. Optionally pick a category (e-Invoice or Income Tax) to restrict retrieval to that set of documents. This is the metadata filter.
4. The answer shows `[n]` markers. Under **Sources**, each marker maps to a document name, page and section, with a link that opens the PDF at that page.
5. **Retrieval details** shows every passage the model was given, with its similarity and rerank score.
6. Ask something the documents do not cover (for example *"What is the GST rate in Singapore?"*) and the assistant answers **Not found in the documents** instead of guessing.

The same pipeline is available as an API: `POST /api/rag` with `{ "question": "...", "category": "e-Invoice" }`.

### Where the AI calls are in the code

| What | File |
|---|---|
| Embedding and LLM HTTP calls (real Gemini REST API, no mocks) | [`src/lib/gemini.ts`](./src/lib/gemini.ts) |
| Retrieval, rerank prompt, answer prompt, hallucination guards | [`src/lib/rag.ts`](./src/lib/rag.ts) |
| Chunking | [`src/lib/chunking.ts`](./src/lib/chunking.ts) |
| Ingestion pipeline | [`scripts/ingest.ts`](./scripts/ingest.ts) |
| Vector search SQL | [`supabase/schema.sql`](./supabase/schema.sql) (`match_chunks`) |

## Evaluation

```bash
npm run eval
```

Free-tier note: Gemini's free tier has a **daily request limit per model** (check yours at https://ai.dev/rate-limit). Each question costs 2 LLM requests (1 rerank, 1 answer), and each one asked in the app costs the same. Setting `GEMINI_RERANK_MODEL` to a different model splits that across two quotas. Progress is saved after every question, so if a quota runs out, finish later with `npm run eval -- --resume`.

Runs the 10 test questions in [`eval/questions.json`](./eval/questions.json) (9 in scope, each with its expected source document, and 1 deliberately out of scope) through the real pipeline. It reports the retrieval hit rate with and without reranking, MRR, whether the final answer cited an expected document, and whether the out-of-scope question was refused. Results are written to `eval/results.md` and `eval/results.json`, and discussed in ARCHITECTURE.md.

## Scope notes

- **Authentication:** none, as allowed by the brief. The app runs as a single hardcoded "Demo User".
- **Activity Log module:** not built (optional in the brief). The dashboard feed is driven by automatic activity events recorded on every create, update, stage change and delete.
- **Optional add-ons A to C:** not built. The time went into the RAG module, including the reranking and metadata-filter bonus.

## Project structure

```
src/app/            pages, server actions (actions.ts), RAG API route
src/components/     Kanban board, Tax Assistant chat, small UI helpers
src/lib/            gemini.ts, rag.ts, chunking.ts, supabase.ts, types.ts
scripts/            ingest.ts, eval.ts, models.ts, documents.ts (manifest)
supabase/           schema.sql, seed.sql
eval/               questions.json, results.md (generated)
data/docs/          downloaded PDFs (git-ignored)
```
