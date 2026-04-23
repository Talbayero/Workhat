/**
 * Centralized validation schemas using Zod
 * Eliminates duplication across 40+ API routes
 * One source of truth for request validation
 */

import { z } from "zod";

// ── Common patterns ──────────────────────────────────────────────────────────

/**
 * Stricter email validation than regex
 * Uses format: https://zod.dev/docs/API/string#email
 */
export const EmailSchema = z.string().email().max(254).toLowerCase();

/**
 * UUID validation
 */
export const UUIDSchema = z.string().uuid();

/**
 * Domain validation
 */
const DOMAIN_RE = /^(?!-)(?:[a-z0-9-]{1,63}\.)+[a-z]{2,63}$/i;
export const DomainSchema = z.string().regex(DOMAIN_RE, "Invalid domain").optional();

/**
 * Tier/enum validation
 */
export const CompanyTierSchema = z.enum(["standard", "pro", "enterprise", "vip"]);

/**
 * Common string fields with length constraints
 */
export const NameSchema = z.string().trim().min(1).max(200, "Name must be 200 characters or less");
export const ShortTextSchema = z.string().max(100, "Text must be 100 characters or less");
export const MediumTextSchema = z.string().max(500, "Text must be 500 characters or less");
export const LongTextSchema = z.string().max(2000, "Text must be 2000 characters or less");

/**
 * Tag list with constraints
 */
export const TagsSchema = z
  .array(z.string().max(50))
  .max(20, "Maximum 20 tags allowed")
  .transform((tags) => [...new Set(tags)]) // Deduplicate
  .default([]);

// ── Request body schemas ─────────────────────────────────────────────────────

/**
 * POST /api/companies
 */
export const CreateCompanySchema = z.object({
  name: NameSchema,
  domain: DomainSchema,
  industry: ShortTextSchema.optional(),
  tier: CompanyTierSchema.default("standard"),
  notes: LongTextSchema.optional(),
  tags: TagsSchema.optional().default([]),
});

export type CreateCompanyRequest = z.infer<typeof CreateCompanySchema>;

/**
 * PATCH /api/companies/:id
 */
export const UpdateCompanySchema = CreateCompanySchema.partial();
export type UpdateCompanyRequest = z.infer<typeof UpdateCompanySchema>;

/**
 * POST /api/contacts
 */
export const CreateContactSchema = z.object({
  company_id: UUIDSchema.optional(),
  email: EmailSchema,
  full_name: NameSchema,
  phone: z.string().max(20).optional(),
  notes: LongTextSchema.optional(),
  tags: TagsSchema.optional().default([]),
});

export type CreateContactRequest = z.infer<typeof CreateContactSchema>;

/**
 * PATCH /api/contacts/:id
 */
export const UpdateContactSchema = CreateContactSchema.partial();
export type UpdateContactRequest = z.infer<typeof UpdateContactSchema>;

/**
 * POST /api/conversations
 */
export const CreateConversationSchema = z.object({
  contactEmail: EmailSchema,
  contactName: NameSchema.optional(),
  subject: z.string().min(1).max(500, "Subject must be 500 characters or less"),
  firstMessage: z.string().min(1).max(5000, "Message must be 5000 characters or less"),
  intent: z.string().max(100).optional(),
});

export type CreateConversationRequest = z.infer<typeof CreateConversationSchema>;

/**
 * POST /api/knowledge
 */
export const CreateKnowledgeSchema = z.object({
  title: NameSchema,
  content: LongTextSchema,
  category: z.string().max(100).optional(),
  tags: TagsSchema.optional().default([]),
});

export type CreateKnowledgeRequest = z.infer<typeof CreateKnowledgeSchema>;

/**
 * PATCH /api/knowledge/:id
 */
export const UpdateKnowledgeSchema = CreateKnowledgeSchema.partial();
export type UpdateKnowledgeRequest = z.infer<typeof UpdateKnowledgeSchema>;

/**
 * POST /api/intents
 */
export const CreateIntentSchema = z.object({
  name: NameSchema,
  description: MediumTextSchema.optional(),
  keywords: z.array(z.string()).optional(),
});

export type CreateIntentRequest = z.infer<typeof CreateIntentSchema>;

/**
 * PATCH /api/intents/:id
 */
export const UpdateIntentSchema = CreateIntentSchema.partial();
export type UpdateIntentRequest = z.infer<typeof UpdateIntentSchema>;

/**
 * POST /api/intent-corrections
 */
export const CreateIntentCorrectionSchema = z.object({
  intent_id: UUIDSchema,
  original_text: z.string().min(1).max(1000),
  intended_intent_id: UUIDSchema,
  confidence: z.number().min(0).max(1).optional(),
});

export type CreateIntentCorrectionRequest = z.infer<typeof CreateIntentCorrectionSchema>;

/**
 * POST /api/qa-reviews
 */
export const CreateQAReviewSchema = z.object({
  conversation_id: UUIDSchema,
  draft_id: UUIDSchema,
  risk_level: z.enum(["green", "yellow", "red"]),
  feedback: MediumTextSchema.optional(),
  approved: z.boolean(),
});

export type CreateQAReviewRequest = z.infer<typeof CreateQAReviewSchema>;

// ── Data validation helpers ──────────────────────────────────────────────────

/**
 * Parse and validate request body
 * Throws ZodError if validation fails
 */
export async function parseRequestBody<T>(
  req: Request,
  schema: z.ZodSchema<T>
): Promise<T> {
  try {
    const body = await req.json();
    return schema.parse(body);
  } catch (error) {
    if (error instanceof z.ZodError) {
      throw new ValidationError(error.issues);
    }
    throw error;
  }
}

/**
 * Custom validation error class
 */
export class ValidationError extends Error {
  constructor(
    public issues: z.ZodIssue[]
  ) {
    super("Validation failed");
    this.name = "ValidationError";
  }

  toJSON() {
    return {
      error: "Validation failed",
      details: this.issues.map((issue) => ({
        field: issue.path.join("."),
        message: issue.message,
        code: issue.code,
      })),
    };
  }
}

/**
 * Safe validation wrapper for use in API routes
 * Returns validation result instead of throwing
 */
export async function validateRequest<T>(
  req: Request,
  schema: z.ZodSchema<T>
): Promise<{ success: true; data: T } | { success: false; error: ValidationError }> {
  try {
    const body = await req.json();
    const result = schema.safeParse(body);

    if (result.success) {
      return { success: true, data: result.data };
    } else {
      return { success: false, error: new ValidationError(result.error.issues) };
    }
  } catch (error) {
    if (error instanceof z.ZodError) {
      return { success: false, error: new ValidationError(error.issues) };
    }
    if (error instanceof SyntaxError) {
      return {
        success: false,
        error: new ValidationError([
          {
            code: "invalid_type",
            expected: "object",
            received: "string",
            path: [],
            message: "Invalid JSON payload",
          } as z.ZodIssue,
        ]),
      };
    }
    throw error;
  }
}
