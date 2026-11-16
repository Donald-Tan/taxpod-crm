# AI Usage

## Tools used

| Tool                                       | Used for                                                                                                               |
| ------------------------------------------ | ---------------------------------------------------------------------------------------------------------------------- |
| Claude (Anthropic), agentic coding session | Reading the brief, proposing the design, writing the application code, scripts and SQL, and drafting the documentation |
| Web search (inside the same session)       | Checking current Gemini model names and embedding dimensions, and finding the public LHDN document URLs                |

## One real example

**Context.** With the evaluation done, I asked the AI what I could still do to improve the case study. It listed nine options and recommended unit tests or a README check, because neither needs Gemini quota. I did not take that recommendation and chose a RAG feature instead.

**My prompt:**

> Show the similarity score and the refusal reason in the Tax Assistant UI when it says 'not found'

**What the AI returned.** It then came back with four design questions, each with options:

1. How to show the similarity score: raw number, percentage, or a label plus the number.
2. Whether to show the minimum required similarity next to the score.
3. How to word the refusal reason: a plain sentence, a sentence plus the internal reason code, or a short label.
4. Where to show it: always visible in the "not found" box, behind a "Why?" toggle, or reason visible with the score moved to retrieval details.

**What I changed.** I made the four decisions:

| Decision       | My choice                               | The AI's first version |
| -------------- | --------------------------------------- | ---------------------- |
| Score format   | Percentage (for example 31%)            | Raw number (0.31)      |
| Threshold      | Show the score and the minimum together | Same                   |
| Reason wording | One plain sentence per case             | Same                   |
| Placement      | Always visible in the "not found" box   | Same                   |

The AI then implemented it to those choices in `src/lib/rag.ts`, `src/app/api/rag/route.ts` and `src/components/TaxAssistant.tsx`. It type-checked and built, but the AI could not run it against the live API, so checking it in the browser was left to me.

**Why.** The RAG module is assessed most closely, and the brief requires the system to say when it does not know. Before this change every refusal looked the same to the user. I chose percentages because the users are a sales team, not engineers, and a plain sentence for the same reason. I kept the score and the minimum visible together so a refusal explains itself without anyone opening the retrieval details.

## Where AI helped most

- **Reading the brief critically.** It spotted two ambiguities before any code was written: the Leads/contacts wording, and the fact that the dashboard needs an activity feed while the Activity Log is optional.
- **Speed on standard code.** CRUD pages, server actions, the Kanban board, the SQL schema and the ingestion script were produced in one pass and compiled.
- **Checking facts instead of assuming.** It looked up the embedding model's dimensions and connected that to pgvector's 2,000-dimension HNSW limit, which is why vectors are stored at 768.
- **Testing its own logic.** It could not call the real APIs from its sandbox, so it stubbed the network calls and ran the RAG pipeline against the stubs. That test showed the reranker was being called before the similarity check (a wasted LLM call on every refused question), and it fixed the order.

## Where AI fell short

- **It could not run the real pipeline.** Its sandbox blocked both the Gemini API and hasil.gov.my. The app was type-checked, linted and built there, and the RAG logic was exercised with stubbed responses, but ingestion, real retrieval and the evaluation had to be run on my machine. The evaluation numbers in ARCHITECTURE.md come from my run, not from the AI.
- **It could not confirm the current Gemini chat model.** Sources disagreed on which Flash model is current, so it made the model names environment variables and added `npm run models` to check them against my key.
- **It could not verify an SST guide link,** so the knowledge base has no SST document. It left that out rather than guess a URL.
- **It guessed a document subtitle once.** It first wrote a longer title for Public Ruling No. 4/2024 than it had evidence for, then caught this and cut the title back to what the source showed.
- **Scaffold defaults needed overriding.** The generated Next.js project enabled newer caching features that the AI was not familiar with. It turned them off and used the simpler dynamic-rendering model. That was a reasonable call, and one I should be able to explain.
- **It did not plan for the free-tier daily quota.** Its first evaluation script ran the reranker twice per question (once to measure it, once inside the answer step), so each question cost 3 requests. The free tier allowed 20 requests per day for the chat model, and the run stopped at question 8 without having saved anything. After I pasted the error, it cut the cost to 2 requests per question, added an optional separate rerank model, made the eval save after every question with a `--resume` flag, and made daily-quota errors fail fast instead of retrying.
- **The evaluation questions were written from document titles and tables of contents,** not from a full read of each PDF. They test whether the right document is retrieved; they do not prove an answer is correct.

## What I verified myself

- [ ] Ran `npm run models`, `npm run ingest` and `npm run eval` and recorded the real results
- [ ] Read through `src/lib/rag.ts` and `src/lib/gemini.ts` and can explain each step
- [ ] Clicked through every CRM flow (create, edit, delete, search, filter, move stage)
- [ ] Checked several assistant answers against the cited PDF pages
