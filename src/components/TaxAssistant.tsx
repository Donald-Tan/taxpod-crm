"use client";

import { useState } from "react";

interface Citation {
  n: number;
  title: string;
  page: number;
  section: string | null;
  url: string | null;
  snippet: string;
}

interface ContextItem {
  n: number;
  title: string;
  page: number;
  section: string | null;
  similarity: number;
  rerankScore: number | null;
}

interface Turn {
  question: string;
  category: string;
  status: "loading" | "done" | "error";
  answerable?: boolean;
  answer?: string;
  citations?: Citation[];
  context?: ContextItem[];
  reranked?: boolean;
  refusalReason?: string | null;
  bestSimilarity?: number | null;
  minSimilarity?: number;
  error?: string;
}

/** Similarity (0 to 1) shown as a whole percentage, which reads more easily than a raw score. */
function percent(value: number | null | undefined): string {
  return value == null ? "n/a" : `${Math.round(value * 100)}%`;
}

/** Plain-language explanation of why the assistant refused to answer. */
function refusalExplanation(turn: Turn): string {
  const best = percent(turn.bestSimilarity);
  const floor = percent(turn.minSimilarity);
  switch (turn.refusalReason) {
    case "no_documents":
      return turn.category
        ? `No ${turn.category} documents have been ingested, so there was nothing to search.`
        : "No documents have been ingested yet, so there was nothing to search.";
    case "low_similarity":
      return `The closest passage scored ${best}, below the minimum of ${floor}, so the question looks unrelated to these documents. No answer was generated.`;
    case "not_in_context":
      return `Related passages were found (best match ${best}), but they do not contain the answer.`;
    case "no_valid_citations":
      return `An answer was drafted (best match ${best}) but could not be tied to a source passage, so it was withheld.`;
    default:
      return "";
  }
}

const EXAMPLES = [
  "How long does a buyer have to reject a validated e-Invoice?",
  "When can a consolidated e-Invoice be issued?",
  "What conditions apply to group relief for companies?",
];

export function TaxAssistant({ categories }: { categories: string[] }) {
  const [turns, setTurns] = useState<Turn[]>([]);
  const [question, setQuestion] = useState("");
  const [category, setCategory] = useState("");
  const busy = turns.some((t) => t.status === "loading");

  async function ask(text: string) {
    const q = text.trim();
    if (!q || busy) return;
    setQuestion("");
    const index = turns.length;
    setTurns((prev) => [...prev, { question: q, category, status: "loading" }]);

    const update = (patch: Partial<Turn>) =>
      setTurns((prev) => prev.map((t, i) => (i === index ? { ...t, ...patch } : t)));

    try {
      const res = await fetch("/api/rag", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ question: q, category: category || null }),
      });
      const data = await res.json();
      if (!res.ok) update({ status: "error", error: data.error ?? "Something went wrong." });
      else update({ status: "done", ...data });
    } catch {
      update({ status: "error", error: "Could not reach the server. Check your connection and try again." });
    }
  }

  return (
    <div className="space-y-4">
      <div className="space-y-4">
        {turns.length === 0 && (
          <div className="rounded-xl border border-dashed border-slate-300 bg-white p-6 text-sm text-slate-600">
            <p className="mb-3">Try one of these:</p>
            <div className="flex flex-wrap gap-2">
              {EXAMPLES.map((example) => (
                <button
                  key={example}
                  onClick={() => ask(example)}
                  className="rounded-full border border-slate-300 px-3 py-1 hover:border-sky-400 hover:text-sky-700"
                >
                  {example}
                </button>
              ))}
            </div>
          </div>
        )}

        {turns.map((turn, i) => (
          <article key={i} className="rounded-xl border border-slate-200 bg-white shadow-sm">
            <header className="border-b border-slate-100 px-5 py-3 text-sm font-medium">
              {turn.question}
              {turn.category && (
                <span className="ml-2 rounded-full bg-slate-100 px-2 py-0.5 text-xs font-normal text-slate-600">
                  {turn.category} only
                </span>
              )}
            </header>
            <div className="space-y-3 px-5 py-4 text-sm">
              {turn.status === "loading" && <p className="text-slate-500">Searching the tax documents…</p>}
              {turn.status === "error" && (
                <p role="alert" className="text-red-700">
                  {turn.error}
                </p>
              )}
              {turn.status === "done" && (
                <>
                  {!turn.answerable && (
                    <div className="rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-amber-900">
                      <div className="font-medium">Not found in the documents</div>
                      {refusalExplanation(turn) && <div className="mt-1 text-xs">{refusalExplanation(turn)}</div>}
                      {turn.bestSimilarity != null && (
                        <div className="mt-1 text-xs text-amber-800">
                          Best match: {percent(turn.bestSimilarity)} · minimum required: {percent(turn.minSimilarity)}
                        </div>
                      )}
                    </div>
                  )}
                  <p className="whitespace-pre-wrap leading-relaxed">{turn.answer}</p>

                  {turn.citations && turn.citations.length > 0 && (
                    <div>
                      <h3 className="mb-2 text-xs font-semibold uppercase text-slate-500">Sources</h3>
                      <ol className="space-y-2">
                        {turn.citations.map((c) => (
                          <li key={c.n} className="rounded-md border border-slate-200 bg-slate-50 p-3">
                            <div className="font-medium">
                              [{c.n}]{" "}
                              {c.url ? (
                                <a href={c.url} target="_blank" rel="noreferrer" className="text-sky-700 hover:underline">
                                  {c.title}
                                </a>
                              ) : (
                                c.title
                              )}
                              , page {c.page}
                              {c.section ? `, section ${c.section}` : ""}
                            </div>
                            <p className="mt-1 text-xs text-slate-600">{c.snippet}…</p>
                          </li>
                        ))}
                      </ol>
                    </div>
                  )}

                  {turn.context && turn.context.length > 0 && (
                    <details className="text-xs text-slate-500">
                      <summary className="cursor-pointer">
                        Retrieval details ({turn.context.length} passages, {turn.reranked ? "reranked" : "vector order"})
                      </summary>
                      <ul className="mt-2 space-y-1">
                        {turn.context.map((c) => (
                          <li key={c.n}>
                            [{c.n}] {c.title}, p.{c.page} · similarity {c.similarity}
                            {c.rerankScore !== null ? ` · rerank ${c.rerankScore}/10` : ""}
                          </li>
                        ))}
                      </ul>
                    </details>
                  )}
                </>
              )}
            </div>
          </article>
        ))}
      </div>

      <form
        onSubmit={(e) => {
          e.preventDefault();
          ask(question);
        }}
        className="sticky bottom-4 flex flex-wrap gap-2 rounded-xl border border-slate-200 bg-white p-3 shadow-md"
      >
        <input
          value={question}
          onChange={(e) => setQuestion(e.target.value)}
          placeholder="Ask about e-invoicing or a public ruling…"
          aria-label="Your tax question"
          maxLength={1000}
          className="min-w-64 flex-1 rounded-md border border-slate-300 px-3 py-2 text-sm outline-none focus:border-sky-500"
        />
        <select
          value={category}
          onChange={(e) => setCategory(e.target.value)}
          aria-label="Limit to a document category"
          className="rounded-md border border-slate-300 bg-white px-2 py-2 text-sm"
        >
          <option value="">All documents</option>
          {categories.map((c) => (
            <option key={c}>{c}</option>
          ))}
        </select>
        <button
          disabled={busy || !question.trim()}
          className="rounded-md bg-sky-600 px-4 py-2 text-sm font-medium text-white hover:bg-sky-700 disabled:opacity-50"
        >
          {busy ? "Asking…" : "Ask"}
        </button>
      </form>
    </div>
  );
}
