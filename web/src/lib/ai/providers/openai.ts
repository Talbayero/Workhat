/**
 * OpenAI provider — calls the Chat Completions API with structured output
 * (response_format: json_schema) using plain fetch, no SDK dependency.
 *
 * Provider abstraction: this file is the only place in the codebase that
 * knows about OpenAI. To add another provider, add a new file here and
 * update src/lib/ai/index.ts to route to it.
 */

import { buildDraftPrompt } from "@/lib/ai/prompts/draft";
import { fetchWithCircuitBreaker } from "@/lib/security/circuit-breaker";
import { DRAFT_JSON_SCHEMA, parseDraftOutput } from "@/lib/ai/schemas/draft";
import type { AIDraftOutput, ConversationContext } from "@/lib/ai/types";

const OPENAI_API_URL = "https://api.openai.com/v1/chat/completions";

export const OPENAI_DEFAULT_MODEL = process.env.OPENAI_MODEL ?? "gpt-4o";

type OpenAIUsage = {
  prompt_tokens: number;
  completion_tokens: number;
  total_tokens: number;
};

type OpenAIResponse = {
  id: string;
  choices: {
    message: { content: string | null };
    finish_reason: string;
  }[];
  usage: OpenAIUsage;
};

type CallResult = {
  output: AIDraftOutput;
  requestTokens: number;
  responseTokens: number;
};

/**
 * Call OpenAI with a structured JSON schema output constraint.
 * Throws on network error, non-200 status, or invalid output shape.
 */
export async function callOpenAIDraft(
  ctx: ConversationContext,
  model = OPENAI_DEFAULT_MODEL
): Promise<CallResult> {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    throw new Error("OPENAI_API_KEY is not set");
  }

  const { systemPrompt, userPrompt } = buildDraftPrompt(ctx);

  const body = {
    model,
    messages: [
      { role: "system", content: systemPrompt },
      { role: "user", content: userPrompt },
    ],
    response_format: {
      type: "json_schema",
      json_schema: DRAFT_JSON_SCHEMA,
    },
    temperature: 0.3, // lower = more consistent, less creative
    max_tokens: 1200,
  };

  const response = await fetchWithCircuitBreaker(OPENAI_API_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify(body),
  }, { key: "openai-chat-completions", timeoutMs: 30_000 });

  if (!response.ok) {
    const errText = await response.text().catch(() => "unknown error");
    throw new Error(`OpenAI API error ${response.status}: ${errText}`);
  }

  const data = (await response.json()) as OpenAIResponse;

  const content = data.choices?.[0]?.message?.content;
  if (!content) {
    throw new Error("OpenAI returned an empty response");
  }

  let rawJson: unknown;
  try {
    rawJson = JSON.parse(content);
  } catch {
    throw new Error(`OpenAI returned non-JSON content: ${content.slice(0, 200)}`);
  }

  const output = parseDraftOutput(rawJson);

  return {
    output,
    requestTokens: data.usage?.prompt_tokens ?? 0,
    responseTokens: data.usage?.completion_tokens ?? 0,
  };
}
