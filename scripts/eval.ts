/**
 * `npm run eval`: run the test questions in eval/questions.json through the
 * real pipeline and report retrieval hit rate.
 *
 *   npm run eval               run all questions from scratch
 *   npm run eval -- --resume   keep finished questions, run only the rest
 *
 * Each question makes exactly one pipeline call (embed -> vector search ->
 * rerank -> answer), so it costs at most 2 LLM requests: 1 rerank + 1 answer.
 * The vector-only result is read from the same call's candidate list, before
 * reranking, so both retrieval modes are compared on identical searches.
 *
 * A "hit" means at least one of the top-k chunks comes from an expected
 * source document. The out-of-scope question passes if the pipeline refuses.
 *
 * Progress is saved after every question, so a quota error loses nothing.
 * Results are written to eval/results.json and eval/results.md.
 */
import "./env";
import { existsSync } from "node:fs";
import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { GeminiError, chatModel, embedModel, rerankModel } from "../src/lib/gemini";
import { askTaxQuestion, ragDefaults, type RetrievedChunk } from "../src/lib/rag";

interface TestQuestion {
  id: string;
  question: string;
  expected: string[] | null;
  note?: string;
}

interface ResultRow {
  id: string;
  question: string;
  expected: string[] | null;
  bestSimilarity: number;
  vectorRank: number | null;
  rerankedRank: number | null;
  rerankApplied: boolean;
  vectorDocs: string[];
  rerankedDocs: string[];
  answered: boolean;
  refusalReason: string | null;
  citedExpected: boolean | null;
  citations: string[];
  answer: string;
}

const EVAL_DIR = path.join(process.cwd(), "eval");
const RESULTS_JSON = path.join(EVAL_DIR, "results.json");
const RESULTS_MD = path.join(EVAL_DIR, "results.md");
const PAUSE_MS = 5000; // pause between questions for per-minute rate limits
const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

/** 1-based rank of the first chunk from an expected document, or null. */
function firstHitRank(chunks: RetrievedChunk[], expected: string[]): number | null {
  const index = chunks.findIndex((c) => expected.includes(c.slug));
  return index >= 0 ? index + 1 : null;
}

async function runQuestion(q: TestQuestion, topK: number): Promise<ResultRow> {
  const result = await askTaxQuestion(q.question);
  const vectorTop = result.candidates.slice(0, topK);
  // `context` is the reranked top-k (or the vector top-k if rerank was skipped).
  const rerankedTop = result.context;
  const bestSimilarity = result.candidates.length ? Math.max(...result.candidates.map((c) => c.similarity)) : 0;

  return {
    id: q.id,
    question: q.question,
    expected: q.expected,
    bestSimilarity: Number(bestSimilarity.toFixed(3)),
    vectorRank: q.expected ? firstHitRank(vectorTop, q.expected) : null,
    rerankedRank: q.expected ? firstHitRank(rerankedTop, q.expected) : null,
    rerankApplied: result.reranked,
    vectorDocs: vectorTop.map((c) => `${c.slug} p.${c.page_number}`),
    rerankedDocs: rerankedTop.map((c) => `${c.slug} p.${c.page_number}`),
    answered: result.answerable,
    refusalReason: result.refusalReason ?? null,
    citedExpected: q.expected ? result.citations.some((c) => q.expected!.includes(c.slug)) : null,
    citations: result.citations.map((c) => `${c.slug} p.${c.page}`),
    answer: result.answer,
  };
}

function summarise(rows: ResultRow[], totalQuestions: number) {
  const { topK, candidates, minSimilarity } = ragDefaults();
  const inScope = rows.filter((r) => r.expected);
  const outOfScope = rows.filter((r) => !r.expected);
  const count = (pred: (r: ResultRow) => boolean) => inScope.filter(pred).length;
  const mrr = (key: "vectorRank" | "rerankedRank") =>
    inScope.length ? inScope.reduce((sum, r) => sum + (r[key] ? 1 / r[key]! : 0), 0) / inScope.length : 0;
  const pct = (n: number, d: number) => (d ? `${n}/${d} (${Math.round((n / d) * 100)}%)` : "n/a");

  return {
    ranAt: new Date().toISOString(),
    complete: rows.length === totalQuestions,
    questionsRun: `${rows.length}/${totalQuestions}`,
    chatModel: chatModel(),
    rerankModel: rerankModel(),
    embedModel: embedModel(),
    topK,
    candidates,
    minSimilarity,
    vectorHitRate: pct(count((r) => r.vectorRank !== null), inScope.length),
    rerankedHitRate: pct(count((r) => r.rerankedRank !== null), inScope.length),
    vectorMRR: Number(mrr("vectorRank").toFixed(3)),
    rerankedMRR: Number(mrr("rerankedRank").toFixed(3)),
    answeredWithExpectedCitation: pct(count((r) => r.answered && r.citedExpected === true), inScope.length),
    outOfScopeRefused: pct(outOfScope.filter((r) => !r.answered).length, outOfScope.length),
    // If the rerank call fails, the pipeline falls back to vector order; this makes that visible.
    rerankApplied: pct(inScope.filter((r) => r.rerankApplied).length, inScope.length),
  };
}

async function save(rows: ResultRow[], totalQuestions: number) {
  const summary = summarise(rows, totalQuestions);
  await writeFile(RESULTS_JSON, JSON.stringify({ summary, rows }, null, 2));

  const md = [
    "# RAG evaluation results",
    "",
    `Generated by \`npm run eval\` on ${summary.ranAt}.`,
    summary.complete ? "" : `\n> **Partial run: ${summary.questionsRun} questions.** Finish with \`npm run eval -- --resume\`.\n`,
    `- Chat model: \`${summary.chatModel}\`, rerank model: \`${summary.rerankModel}\`, embedding model: \`${summary.embedModel}\``,
    `- top-k: ${summary.topK}, rerank candidates: ${summary.candidates}, similarity floor: ${summary.minSimilarity}`,
    "",
    "| Metric | Result |",
    "|---|---|",
    `| Retrieval hit rate @${summary.topK}, vector only | ${summary.vectorHitRate} |`,
    `| Retrieval hit rate @${summary.topK}, with rerank | ${summary.rerankedHitRate} |`,
    `| MRR, vector only | ${summary.vectorMRR} |`,
    `| MRR, with rerank | ${summary.rerankedMRR} |`,
    `| Answered and cited an expected document | ${summary.answeredWithExpectedCitation} |`,
    `| Out-of-scope questions refused | ${summary.outOfScopeRefused} |`,
    `| In-scope questions where rerank actually ran | ${summary.rerankApplied} |`,
    "",
    "| ID | Question | Expected | Best sim. | Vector rank | Rerank rank | Answered | Cited |",
    "|---|---|---|---|---|---|---|---|",
    ...rows.map(
      (r) =>
        `| ${r.id} | ${r.question} | ${r.expected ? r.expected.join(" / ") : "(none, should refuse)"} | ${r.bestSimilarity} | ${
          r.expected ? (r.vectorRank ?? "miss") : "-"
        } | ${r.expected ? (r.rerankedRank ?? "miss") : "-"} | ${r.answered ? "yes" : `no (${r.refusalReason})`} | ${
          r.citations.join(", ") || "-"
        } |`,
    ),
    "",
  ].join("\n");
  await writeFile(RESULTS_MD, md);
  return summary;
}

async function main() {
  const resume = process.argv.includes("--resume");
  const { topK } = ragDefaults();
  const questions = JSON.parse(await readFile(path.join(EVAL_DIR, "questions.json"), "utf8")) as TestQuestion[];

  let rows: ResultRow[] = [];
  if (resume && existsSync(RESULTS_JSON)) {
    const previous = JSON.parse(await readFile(RESULTS_JSON, "utf8")) as { rows: ResultRow[] };
    const ids = new Set(questions.map((q) => q.id));
    rows = previous.rows.filter((r) => ids.has(r.id));
    console.log(`Resuming: ${rows.length} question(s) already done.`);
  }
  const done = new Set(rows.map((r) => r.id));

  let stoppedEarly = false;
  for (const q of questions) {
    if (done.has(q.id)) continue;
    console.log(`\n${q.id}: ${q.question}`);
    try {
      const row = await runQuestion(q, topK);
      rows.push(row);
      // Keep rows in questions.json order, then save after every question.
      rows.sort((a, b) => questions.findIndex((x) => x.id === a.id) - questions.findIndex((x) => x.id === b.id));
      await save(rows, questions.length);
      console.log(
        q.expected
          ? `  vector rank: ${row.vectorRank ?? "miss"} | reranked rank: ${row.rerankedRank ?? "miss"} | answered: ${row.answered}`
          : `  out of scope -> ${row.answered ? "ANSWERED (wrong)" : `refused (${row.refusalReason})`}`,
      );
    } catch (err) {
      stoppedEarly = true;
      const quota = err instanceof GeminiError && err.status === 429;
      console.error(`  STOPPED: ${(err as Error).message.slice(0, 400)}`);
      if (quota) console.error("  Progress is saved. When quota is available again, run: npm run eval -- --resume");
      break;
    }
    await sleep(PAUSE_MS);
  }

  const summary = await save(rows, questions.length);
  console.log("\n" + JSON.stringify(summary, null, 2));
  console.log("\nWrote eval/results.md and eval/results.json");
  if (stoppedEarly) process.exit(1);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
