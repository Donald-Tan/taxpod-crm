import { NextResponse } from "next/server";
import { GeminiError } from "@/lib/gemini";
import { CATEGORIES, askTaxQuestion } from "@/lib/rag";

export const dynamic = "force-dynamic";
// Embedding + rerank + answer is three model calls; allow time on hosted platforms.
export const maxDuration = 60;

const MAX_QUESTION_LENGTH = 1000;

/** POST /api/rag { question, category? } -> grounded answer with citations. */
export async function POST(request: Request) {
  let body: { question?: unknown; category?: unknown };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Request body must be JSON." }, { status: 400 });
  }

  const question = typeof body.question === "string" ? body.question.trim() : "";
  if (!question) return NextResponse.json({ error: "Please enter a question." }, { status: 400 });
  if (question.length > MAX_QUESTION_LENGTH) {
    return NextResponse.json({ error: `Question is too long (max ${MAX_QUESTION_LENGTH} characters).` }, { status: 400 });
  }

  const category =
    typeof body.category === "string" && (CATEGORIES as readonly string[]).includes(body.category)
      ? body.category
      : null;

  try {
    const result = await askTaxQuestion(question, { category });
    return NextResponse.json({
      answerable: result.answerable,
      answer: result.answer,
      citations: result.citations,
      refusalReason: result.refusalReason ?? null,
      bestSimilarity: result.bestSimilarity === null ? null : Number(result.bestSimilarity.toFixed(3)),
      minSimilarity: result.minSimilarity,
      reranked: result.reranked,
      // Everything the model was shown, so the UI can display the evidence.
      context: result.context.map((c, i) => ({
        n: i + 1,
        title: c.title,
        page: c.page_number,
        section: c.section,
        similarity: Number(c.similarity.toFixed(3)),
        rerankScore: c.rerank_score ?? null,
      })),
    });
  } catch (err) {
    console.error("[rag] request failed:", err);
    if (err instanceof GeminiError && err.status === 429) {
      const daily = /daily quota/i.test(err.message);
      return NextResponse.json(
        {
          error: daily
            ? "The AI model's daily free-tier quota is used up. It resets at midnight Pacific time, or a different model can be set in .env.local."
            : "The AI service is rate limited right now. Wait a minute and try again.",
        },
        { status: 429 },
      );
    }
    const message = err instanceof Error ? err.message : "Unknown error";
    return NextResponse.json({ error: `Could not answer the question: ${message}` }, { status: 500 });
  }
}
