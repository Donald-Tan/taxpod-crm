/**
 * Thin wrapper over the Gemini REST API (generativelanguage.googleapis.com).
 *
 * Plain `fetch` is used on purpose instead of an SDK: every embedding call and
 * every LLM call in this project goes through the two functions below, so the
 * exact request bodies are visible in one place.
 */

const BASE_URL = "https://generativelanguage.googleapis.com/v1beta";

export const EMBED_DIMENSIONS = 768;

export function chatModel(): string {
  return process.env.GEMINI_CHAT_MODEL || "gemini-3.6-flash";
}

/** Model used for reranking. Defaults to the chat model; a lighter model can be set to save quota. */
export function rerankModel(): string {
  return process.env.GEMINI_RERANK_MODEL || chatModel();
}

export function embedModel(): string {
  return process.env.GEMINI_EMBED_MODEL || "gemini-embedding-001";
}

function apiKey(): string {
  const key = process.env.GEMINI_API_KEY;
  if (!key) throw new Error("Missing GEMINI_API_KEY. Copy .env.example to .env.local and fill it in.");
  return key;
}

export class GeminiError extends Error {
  constructor(
    message: string,
    public status: number,
  ) {
    super(message);
    this.name = "GeminiError";
  }
}

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

/** POST with retry + exponential backoff on rate limits (429) and 5xx errors. */
async function post<T>(path: string, body: unknown, maxRetries = 5): Promise<T> {
  let lastError: GeminiError | null = null;
  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    let res: Response;
    try {
      res = await fetch(`${BASE_URL}/${path}`, {
        method: "POST",
        headers: { "Content-Type": "application/json", "x-goog-api-key": apiKey() },
        body: JSON.stringify(body),
      });
    } catch (err) {
      lastError = new GeminiError(`Network error calling Gemini: ${(err as Error).message}`, 0);
      await sleep(1000 * 2 ** attempt);
      continue;
    }

    if (res.ok) return (await res.json()) as T;

    const text = await res.text();
    lastError = new GeminiError(`Gemini ${res.status}: ${text.slice(0, 500)}`, res.status);
    // A daily quota will not recover within a few retries, so fail fast.
    if (res.status === 429 && /per ?day/i.test(text)) {
      throw new GeminiError(
        `Gemini daily quota exhausted for this model. Wait for the quota to reset, or set a different model in .env.local. Details: ${text.slice(0, 300)}`,
        429,
      );
    }
    const retryable = res.status === 429 || res.status >= 500;
    if (!retryable) throw lastError;
    // 2s, 4s, 8s, 16s, 32s. Free-tier quotas are per minute, so later retries
    // are long enough for the window to roll over.
    await sleep(2000 * 2 ** attempt);
  }
  throw lastError ?? new GeminiError("Gemini request failed", 0);
}

function normalise(values: number[]): number[] {
  const norm = Math.sqrt(values.reduce((sum, v) => sum + v * v, 0));
  return norm === 0 ? values : values.map((v) => v / norm);
}

export type EmbedTask = "RETRIEVAL_DOCUMENT" | "RETRIEVAL_QUERY";

/**
 * Embed a batch of texts. `RETRIEVAL_DOCUMENT` is used at ingestion time and
 * `RETRIEVAL_QUERY` at question time, as the embedding API recommends for
 * asymmetric search. Vectors are truncated to 768 dimensions by the API and
 * re-normalised here, because only the full-size output is unit length.
 */
export async function embedTexts(texts: string[], task: EmbedTask): Promise<number[][]> {
  if (texts.length === 0) return [];
  const model = embedModel();
  const data = await post<{ embeddings: { values: number[] }[] }>(`models/${model}:batchEmbedContents`, {
    requests: texts.map((text) => ({
      model: `models/${model}`,
      content: { parts: [{ text }] },
      taskType: task,
      outputDimensionality: EMBED_DIMENSIONS,
    })),
  });
  if (!data.embeddings || data.embeddings.length !== texts.length) {
    throw new GeminiError("Embedding response did not match the number of inputs", 0);
  }
  return data.embeddings.map((e) => normalise(e.values));
}

export async function embedQuery(text: string): Promise<number[]> {
  const [vector] = await embedTexts([text], "RETRIEVAL_QUERY");
  return vector;
}

interface GenerateResponse {
  candidates?: { content?: { parts?: { text?: string }[] }; finishReason?: string }[];
  promptFeedback?: { blockReason?: string };
}

/**
 * Generate a JSON response constrained by `schema` (Gemini structured output).
 * Temperature defaults to 0 so answers are as repeatable as possible.
 */
export async function generateJson<T>(opts: {
  system: string;
  user: string;
  schema: Record<string, unknown>;
  temperature?: number;
  model?: string;
}): Promise<T> {
  const data = await post<GenerateResponse>(`models/${opts.model ?? chatModel()}:generateContent`, {
    systemInstruction: { parts: [{ text: opts.system }] },
    contents: [{ role: "user", parts: [{ text: opts.user }] }],
    generationConfig: {
      temperature: opts.temperature ?? 0,
      responseMimeType: "application/json",
      responseSchema: opts.schema,
    },
  });

  if (data.promptFeedback?.blockReason) {
    throw new GeminiError(`Prompt blocked by Gemini: ${data.promptFeedback.blockReason}`, 0);
  }
  const text = data.candidates?.[0]?.content?.parts?.map((p) => p.text ?? "").join("") ?? "";
  if (!text) {
    throw new GeminiError(
      `Gemini returned no text (finishReason: ${data.candidates?.[0]?.finishReason ?? "unknown"})`,
      0,
    );
  }
  try {
    return JSON.parse(text) as T;
  } catch {
    throw new GeminiError(`Gemini returned invalid JSON: ${text.slice(0, 200)}`, 0);
  }
}

/** List the models this API key can use. Used by `npm run models`. */
export async function listModels(): Promise<{ name: string; methods: string[] }[]> {
  const res = await fetch(`${BASE_URL}/models?pageSize=200`, { headers: { "x-goog-api-key": apiKey() } });
  if (!res.ok) throw new GeminiError(`Gemini ${res.status}: ${(await res.text()).slice(0, 500)}`, res.status);
  const data = (await res.json()) as { models?: { name: string; supportedGenerationMethods?: string[] }[] };
  return (data.models ?? []).map((m) => ({
    name: m.name.replace(/^models\//, ""),
    methods: m.supportedGenerationMethods ?? [],
  }));
}
