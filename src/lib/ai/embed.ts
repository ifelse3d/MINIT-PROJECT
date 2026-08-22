import { AI_PROVIDERS, type AiProviderName } from "./provider";

// ---------------------------------------------------------------------------
// EMBEDDINGS — turning text into the 768 numbers pgvector searches on.
//
// Server-side only, like every other file in src/lib/ai (CLAUDE.md stack rule).
//
// 🔴 768 IS FIXED BY THE DATABASE, NOT BY TASTE.
// supabase/migrations/20260822000000_minutes_search.sql declares
// `embedding vector(768)` with a `check (dim = 768)` beside it. Changing this
// number means rebuilding the index and re-embedding every document, so it is a
// constant here and asserted on every vector that comes back from a vendor —
// a model that quietly returns 3072 must fail loudly at the boundary, not
// silently produce rows Postgres will reject one at a time.
//
// Why 768 and not the default: measured on J's own key, 2026-08-20. The three
// embedding models available there all default to 3072 dimensions, and
// pgvector's hnsw index tops out at 2000 — so the default cannot be indexed at
// all. gemini-embedding-001 honours outputDimensionality: 768.
// (docs/助手重做-设计.md §3.)
//
// 🔴 VECTORS FROM DIFFERENT MODELS ARE NOT COMPARABLE. Every row records the
// model that produced it and every search filters on it. That is also what lets
// two models coexist for the same chunk, which is how they get compared without
// re-embedding the corpus twice — J's "做 slot 让我增加⋯⋯之後要做對比".
//
// COST: this is not charged to the organisation's AI quota. It is not an action
// the person asked for, and it is very cheap (docs/助手重做-设计.md §3, and
// docs/方案与权益设计.md §4 "free forever").
// ---------------------------------------------------------------------------

/** The one dimension the schema accepts. Do not change without a migration. */
export const EMBED_DIM = 768;

/** Vendor default when AI_MODEL_EMBED is unset (docs/助手重做-设计.md §6). */
const DEFAULT_EMBED_MODEL = "gemini:gemini-embedding-001";

export type ResolvedEmbedModel = {
  provider: AiProviderName;
  model: string;
  /** "provider:model" — exactly what goes in minutes_embeddings.model. */
  id: string;
};

/**
 * Which model embeds text, from AI_MODEL_EMBED ("provider:model").
 *
 * A malformed or unknown value falls back to the default rather than throwing:
 * a typo in an env var must not take semantic search offline, and the row's
 * `model` column records what was ACTUALLY used, so a fallback is visible in
 * the data rather than silent.
 */
export function resolveEmbedModel(
  raw: string | undefined = process.env.AI_MODEL_EMBED,
): ResolvedEmbedModel {
  const value = (raw ?? "").trim() || DEFAULT_EMBED_MODEL;
  const [providerRaw, ...rest] = value.split(":");
  const model = rest.join(":").trim();
  const provider = providerRaw?.trim() as AiProviderName;
  if (!model || !(AI_PROVIDERS as readonly string[]).includes(provider)) {
    const [p, ...r] = DEFAULT_EMBED_MODEL.split(":");
    return {
      provider: p as AiProviderName,
      model: r.join(":"),
      id: DEFAULT_EMBED_MODEL,
    };
  }
  return { provider, model, id: `${provider}:${model}` };
}

/** Thrown when embeddings cannot be produced. Callers decide what to do — the
 *  chat route degrades to answering without records rather than failing. */
export class EmbeddingUnavailableError extends Error {
  readonly code = "EMBEDDING_UNAVAILABLE";
  constructor(message: string) {
    super(message);
    this.name = "EmbeddingUnavailableError";
  }
}

/**
 * Embed one or more pieces of text. Order of the result matches the input.
 *
 * `kind` matters to some vendors: a stored passage and a user's question are
 * embedded with different task hints, and using the wrong one measurably hurts
 * recall. Gemini calls these RETRIEVAL_DOCUMENT and RETRIEVAL_QUERY.
 */
export async function embedTexts(
  texts: string[],
  kind: "document" | "query" = "document",
): Promise<number[][]> {
  if (texts.length === 0) return [];
  const resolved = resolveEmbedModel();
  switch (resolved.provider) {
    case "gemini":
      return embedWithGemini(texts, kind, resolved.model);
    case "openai":
      return embedWithOpenai(texts, resolved.model);
    default:
      // anthropic and xai have no embedding endpoint. Say which one was asked
      // for; do not silently substitute a different vendor's vectors, which
      // would be unsearchable against everything already stored.
      throw new EmbeddingUnavailableError(
        `AI_MODEL_EMBED names ${resolved.id}, which has no embedding API. Use a gemini: or openai: model.`,
      );
  }
}

/** Embed a single string — the search-query case. */
export async function embedQuery(text: string): Promise<number[]> {
  const [vector] = await embedTexts([text], "query");
  if (!vector) throw new EmbeddingUnavailableError("No vector was returned.");
  return vector;
}

// --- vendors -----------------------------------------------------------------

const REQUEST_TIMEOUT_MS = 30_000;

async function embedWithGemini(
  texts: string[],
  kind: "document" | "query",
  model: string,
): Promise<number[][]> {
  const key = process.env.GEMINI_API_KEY;
  if (!key) {
    throw new EmbeddingUnavailableError("GEMINI_API_KEY is not set.");
  }
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:batchEmbedContents`;
  const taskType = kind === "query" ? "RETRIEVAL_QUERY" : "RETRIEVAL_DOCUMENT";

  const body = JSON.stringify({
    requests: texts.map((text) => ({
      model: `models/${model}`,
      content: { parts: [{ text }] },
      taskType,
      outputDimensionality: EMBED_DIM,
    })),
  });

  const json = await postJson(url, body, {
    "Content-Type": "application/json",
    "x-goog-api-key": key,
  });
  const embeddings = (json as { embeddings?: { values?: number[] }[] }).embeddings;
  if (!Array.isArray(embeddings) || embeddings.length !== texts.length) {
    throw new EmbeddingUnavailableError(
      "Gemini returned a different number of embeddings than texts sent.",
    );
  }
  return embeddings.map((e, i) => assertDim(e.values, i));
}

async function embedWithOpenai(
  texts: string[],
  model: string,
): Promise<number[][]> {
  const key = process.env.OPENAI_API_KEY;
  if (!key) {
    throw new EmbeddingUnavailableError("OPENAI_API_KEY is not set.");
  }
  const body = JSON.stringify({
    model,
    input: texts,
    dimensions: EMBED_DIM,
  });
  const json = await postJson("https://api.openai.com/v1/embeddings", body, {
    "Content-Type": "application/json",
    Authorization: `Bearer ${key}`,
  });
  const data = (json as { data?: { embedding?: number[]; index?: number }[] }).data;
  if (!Array.isArray(data) || data.length !== texts.length) {
    throw new EmbeddingUnavailableError(
      "OpenAI returned a different number of embeddings than texts sent.",
    );
  }
  // The API documents that `data` may come back out of order; it carries an
  // index for exactly this reason. Sorting is cheap insurance against silently
  // pairing a vector with the wrong chunk.
  const sorted = [...data].sort((a, b) => (a.index ?? 0) - (b.index ?? 0));
  return sorted.map((d, i) => assertDim(d.embedding, i));
}

async function postJson(
  url: string,
  body: string,
  headers: Record<string, string>,
): Promise<unknown> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
  try {
    const res = await fetch(url, {
      method: "POST",
      headers,
      body,
      signal: controller.signal,
    });
    if (!res.ok) {
      // PDPA: status and the vendor's own message only — never the text we
      // sent, which is meeting content.
      const detail = await res.text().catch(() => "");
      throw new EmbeddingUnavailableError(
        `Embedding API ${res.status}: ${detail.slice(0, 200)}`,
      );
    }
    return (await res.json()) as unknown;
  } catch (e) {
    if (e instanceof EmbeddingUnavailableError) throw e;
    throw new EmbeddingUnavailableError("The embedding request did not complete.");
  } finally {
    clearTimeout(timer);
  }
}

/** The boundary check. A wrong-length vector is rejected here, with the model
 *  named, instead of becoming a Postgres error per row much later. */
function assertDim(values: number[] | undefined, index: number): number[] {
  if (!Array.isArray(values) || values.length !== EMBED_DIM) {
    throw new EmbeddingUnavailableError(
      `Embedding ${index} has ${values?.length ?? 0} dimensions, but the database column is vector(${EMBED_DIM}). Check AI_MODEL_EMBED.`,
    );
  }
  return values;
}
