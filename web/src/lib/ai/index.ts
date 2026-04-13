/**
 * AI layer public surface.
 * All callers (API routes, background jobs) import from here — never from
 * the provider files directly. This keeps the provider swap confined to
 * this single file.
 */

import { callOpenAIDraft, OPENAI_DEFAULT_MODEL } from "@/lib/ai/providers/openai";
import type {
  AIDraftResult,
  GenerateDraftOptions,
} from "@/lib/ai/types";

export const PROMPT_VERSION = "v1.0";

/**
 * Generate an AI reply draft for the given conversation context.
 * Selects the correct provider, calls it, and returns a fully typed result
 * ready for the caller to persist and return.
 */
export async function generateDraft(
  options: GenerateDraftOptions
): Promise<AIDraftResult> {
  const {
    context,
    provider = "openai",
    model = OPENAI_DEFAULT_MODEL,
    promptVersion = PROMPT_VERSION,
  } = options;

  const start = Date.now();

  let callResult: Awaited<ReturnType<typeof callOpenAIDraft>>;

  if (provider === "openai") {
    callResult = await callOpenAIDraft(context, model);
  } else {
    throw new Error(`Unknown AI provider: ${provider}`);
  }

  const latencyMs = Date.now() - start;

  return {
    id: null, // caller is responsible for persisting and filling this in
    ...callResult.output,
    provider,
    model,
    promptVersion,
    requestTokens: callResult.requestTokens,
    responseTokens: callResult.responseTokens,
    latencyMs,
  };
}
