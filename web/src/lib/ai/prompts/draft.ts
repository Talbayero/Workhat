/**
 * Layered prompt builder for draft reply generation.
 *
 * The spec defines 5 layers, assembled in order:
 *   1. System behavior
 *   2. Org policy and tone
 *   3. Retrieved knowledge snippets
 *   4. Conversation context
 *   5. Output schema instructions
 *
 * Each layer is built independently so they can be versioned, swapped,
 * or A/B tested without touching the others.
 */

import type { ConversationContext, KnowledgeSnippet } from "@/lib/ai/types";
import { DRAFT_JSON_SCHEMA } from "@/lib/ai/schemas/draft";

// ── Layer 1: System behavior ──────────────────────────────────────────────────

export const SYSTEM_PROMPT = `You are an expert customer support agent for a B2B SaaS company.
Your role is to draft clear, accurate, and empathetic replies to customer messages.

Your drafts will always be reviewed and edited by a human agent before sending.
This means you should:
- Produce a complete, ready-to-send reply — not a template with placeholders
- Flag anything uncertain rather than guessing
- Be honest about missing information in the missingContext field
- Never fabricate specific facts (order numbers, dates, amounts, names)

Tone: Professional, warm, and direct. Avoid corporate filler phrases.`.trim();

// ── Layer 2: Org policy and tone ─────────────────────────────────────────────
// V1: static defaults. Phase 2: fetch from org settings / knowledge entries
// tagged as tone_guide or sop.

export function buildPolicyLayer(): string {
  return `## Org Policy and Tone Guidelines
- Always acknowledge the customer's issue before offering a solution
- Do not promise specific resolution timelines unless you have confirmed data
- Refunds over $100 require manager approval — flag this as a risk if relevant
- Use the customer's first name in the greeting
- Close with a clear next step or call to action
- Never apologize for company policies — explain them neutrally instead`.trim();
}

// ── Layer 3: Knowledge snippets ───────────────────────────────────────────────

export function buildKnowledgeLayer(snippets: KnowledgeSnippet[]): string {
  if (snippets.length === 0) {
    return "## Relevant Knowledge\nNo knowledge entries matched this conversation. Use general best practices.";
  }

  const formatted = snippets
    .map(
      (s, i) =>
        `### [${i + 1}] ${s.title} (${s.entryType})\n${s.excerpt.trim()}`
    )
    .join("\n\n");

  return `## Relevant Knowledge\nThe following entries from the knowledge base are relevant to this conversation:\n\n${formatted}`;
}

// ── Layer 4: Conversation context ─────────────────────────────────────────────

export function buildConversationLayer(ctx: ConversationContext): string {
  const contact = `Customer: ${ctx.contact.fullName}
Email: ${ctx.contact.email}
Account tier: ${ctx.contact.tier || "unknown"}
${ctx.contact.notes ? `Notes: ${ctx.contact.notes}` : ""}`.trim();

  const company = ctx.company
    ? `Company: ${ctx.company.name} (${ctx.company.industry})`
    : "Company: not on file";

  const thread = ctx.messages
    .map((m) => {
      const label =
        m.role === "customer"
          ? "Customer"
          : m.role === "agent"
          ? "Agent"
          : m.role === "ai"
          ? "AI (previous draft)"
          : "Internal";
      return `[${label} — ${m.sentAt}]\n${m.body.trim()}`;
    })
    .join("\n\n---\n\n");

  return `## Conversation Context
Subject: ${ctx.subject}
Status: ${ctx.status}
Risk level: ${ctx.riskLevel}

### Contact
${contact}
${company}

### Thread (oldest first)
${thread}`.trim();
}

// ── Layer 5: Output schema instructions ───────────────────────────────────────

export function buildOutputLayer(): string {
  const fields = Object.keys(DRAFT_JSON_SCHEMA.schema.properties)
    .map((k) => {
      const prop = DRAFT_JSON_SCHEMA.schema.properties[k as keyof typeof DRAFT_JSON_SCHEMA.schema.properties];
      return `- ${k}: ${prop.description}`;
    })
    .join("\n");

  return `## Output Instructions
Respond ONLY with a valid JSON object matching this schema. No prose, no markdown fencing.

Fields:
${fields}

Set confidenceLevel based on:
- green: you have all needed context and the reply is straightforward
- yellow: you're missing some information or the situation has moderate complexity
- red: significant information is missing, policy is unclear, or the issue is high-risk`.trim();
}

// ── Final assembly ────────────────────────────────────────────────────────────

export type DraftPrompt = {
  systemPrompt: string;
  userPrompt: string;
};

export function buildDraftPrompt(ctx: ConversationContext): DraftPrompt {
  const userPrompt = [
    buildPolicyLayer(),
    buildKnowledgeLayer(ctx.knowledgeSnippets),
    buildConversationLayer(ctx),
    buildOutputLayer(),
    "\nNow write the draft reply JSON:",
  ].join("\n\n");

  return {
    systemPrompt: SYSTEM_PROMPT,
    userPrompt,
  };
}
