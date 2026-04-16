import { fetchWithCircuitBreaker } from "@/lib/security/circuit-breaker";

/* ─────────────────────────────────────────────
   OpenAI Embeddings — raw fetch, no SDK.
   Model: text-embedding-3-small (1536 dims)

   Used to:
   1. Generate embeddings when knowledge entries are created/updated
   2. Generate query embedding for semantic search in AI draft route
───────────────────────────────────────────── */

const EMBEDDING_MODEL = "text-embedding-3-small";
const OPENAI_EMBEDDINGS_URL = "https://api.openai.com/v1/embeddings";

export async function generateEmbedding(text: string): Promise<number[]> {
  const key = process.env.OPENAI_API_KEY;
  if (!key) throw new Error("OPENAI_API_KEY is not set");

  const res = await fetchWithCircuitBreaker(OPENAI_EMBEDDINGS_URL, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${key}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: EMBEDDING_MODEL,
      input: text.slice(0, 8000), // safety cap
    }),
  }, { key: "openai-embeddings", timeoutMs: 20_000 });

  if (!res.ok) {
    const err = await res.json().catch(() => ({})) as { error?: { message?: string } };
    throw new Error(`Embeddings API error: ${err.error?.message ?? res.statusText}`);
  }

  const data = await res.json() as { data: { embedding: number[] }[] };
  return data.data[0].embedding;
}

/** Auto-split a body of text into chunks for retrieval.
 *  Splits on double newlines first, then caps each chunk at ~600 chars. */
export function chunkText(text: string, maxCharsPerChunk = 600): string[] {
  const paragraphs = text
    .split(/\n{2,}/)
    .map((p) => p.trim())
    .filter(Boolean);

  const chunks: string[] = [];
  let current = "";

  for (const para of paragraphs) {
    if (current.length === 0) {
      current = para;
    } else if (current.length + para.length + 2 <= maxCharsPerChunk) {
      current += "\n\n" + para;
    } else {
      chunks.push(current);
      current = para;
    }
  }
  if (current) chunks.push(current);

  return chunks.length > 0 ? chunks : [text.slice(0, maxCharsPerChunk)];
}
