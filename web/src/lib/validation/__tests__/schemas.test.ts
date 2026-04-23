/**
 * Tests for validation schemas
 * Coverage: All schemas and validation helpers
 */

import {
  EmailSchema,
  NameSchema,
  CreateCompanySchema,
  CreateContactSchema,
  CreateConversationSchema,
  CompanyTierSchema,
  TagsSchema,
  ValidationError,
  validateRequest,
} from "../schemas";

describe("Validation Schemas", () => {
  describe("EmailSchema", () => {
    it("should accept valid emails", () => {
      const validEmails = [
        "user@example.com",
        "first.last@company.co.uk",
        "user+tag@example.org",
      ];

      validEmails.forEach((email) => {
        expect(() => EmailSchema.parse(email)).not.toThrow();
      });
    });

    it("should reject invalid emails", () => {
      const invalidEmails = ["not-an-email", "@example.com", "user@", "user name@example.com"];

      invalidEmails.forEach((email) => {
        expect(() => EmailSchema.parse(email)).toThrow();
      });
    });

    it("should normalize email to lowercase", () => {
      const result = EmailSchema.parse("User@Example.COM");
      expect(result).toBe("user@example.com");
    });

    it("should enforce max length (254)", () => {
      const tooLong = "a".repeat(250) + "@example.com";
      expect(() => EmailSchema.parse(tooLong)).toThrow();
    });
  });

  describe("NameSchema", () => {
    it("should accept valid names", () => {
      expect(() => NameSchema.parse("John Doe")).not.toThrow();
      expect(() => NameSchema.parse("José García")).not.toThrow();
      expect(() => NameSchema.parse("李明")).not.toThrow();
    });

    it("should reject empty names", () => {
      expect(() => NameSchema.parse("")).toThrow();
      expect(() => NameSchema.parse("   ")).toThrow();
    });

    it("should enforce max length (200)", () => {
      const tooLong = "A".repeat(201);
      expect(() => NameSchema.parse(tooLong)).toThrow();
    });

    it("should accept max length (200)", () => {
      const maxLength = "A".repeat(200);
      expect(() => NameSchema.parse(maxLength)).not.toThrow();
    });
  });

  describe("CompanyTierSchema", () => {
    it("should accept valid tiers", () => {
      const validTiers = ["standard", "pro", "enterprise", "vip"];
      validTiers.forEach((tier) => {
        expect(() => CompanyTierSchema.parse(tier)).not.toThrow();
      });
    });

    it("should reject invalid tiers", () => {
      const invalidTiers = ["free", "premium", "STANDARD", ""];
      invalidTiers.forEach((tier) => {
        expect(() => CompanyTierSchema.parse(tier)).toThrow();
      });
    });
  });

  describe("TagsSchema", () => {
    it("should accept valid tag arrays", () => {
      const result = TagsSchema.parse(["tag1", "tag2", "tag3"]);
      expect(result).toEqual(["tag1", "tag2", "tag3"]);
    });

    it("should deduplicate tags", () => {
      const result = TagsSchema.parse(["tag1", "tag2", "tag1", "tag3", "tag2"]);
      expect(result).toEqual(["tag1", "tag2", "tag3"]);
    });

    it("should reject more than 20 tags", () => {
      const tooManyTags = Array.from({ length: 21 }, (_, i) => `tag${i}`);
      expect(() => TagsSchema.parse(tooManyTags)).toThrow();
    });

    it("should reject tags longer than 50 chars", () => {
      const longTag = "A".repeat(51);
      expect(() => TagsSchema.parse([longTag])).toThrow();
    });

    it("should default to empty array", () => {
      const result = TagsSchema.parse(undefined);
      expect(result).toEqual([]);
    });
  });

  describe("CreateCompanySchema", () => {
    it("should validate complete company data", () => {
      const validCompany = {
        name: "Acme Corp",
        domain: "acme.com",
        industry: "Technology",
        tier: "pro" as const,
        notes: "Important client",
        tags: ["enterprise", "saas"],
      };

      expect(() => CreateCompanySchema.parse(validCompany)).not.toThrow();
    });

    it("should accept minimal company data", () => {
      const minimalCompany = { name: "Simple Co" };
      expect(() => CreateCompanySchema.parse(minimalCompany)).not.toThrow();
    });

    it("should default tier to 'standard'", () => {
      const result = CreateCompanySchema.parse({ name: "Test Co" });
      expect(result.tier).toBe("standard");
    });

    it("should reject missing name", () => {
      expect(() => CreateCompanySchema.parse({ domain: "example.com" })).toThrow();
    });

    it("should validate domain format", () => {
      expect(() => CreateCompanySchema.parse({ name: "Test", domain: "invalid" })).toThrow();
    });

    it("should reject invalid tier", () => {
      expect(() =>
        CreateCompanySchema.parse({ name: "Test", tier: "free" })
      ).toThrow();
    });
  });

  describe("CreateContactSchema", () => {
    it("should validate complete contact data", () => {
      const validContact = {
        company_id: "550e8400-e29b-41d4-a716-446655440000",
        email: "john@example.com",
        full_name: "John Doe",
        phone: "+1-555-1234",
        notes: "VIP customer",
        tags: ["premium", "support"],
      };

      expect(() => CreateContactSchema.parse(validContact)).not.toThrow();
    });

    it("should require email", () => {
      expect(() => CreateContactSchema.parse({ full_name: "John" })).toThrow();
    });

    it("should require full_name", () => {
      expect(() => CreateContactSchema.parse({ email: "john@example.com" })).toThrow();
    });
  });

  describe("CreateConversationSchema", () => {
    it("should validate complete conversation", () => {
      const validConversation = {
        contactEmail: "customer@example.com",
        contactName: "John Customer",
        subject: "Support Request",
        firstMessage: "I need help with...",
        intent: "support",
      };

      expect(() => CreateConversationSchema.parse(validConversation)).not.toThrow();
    });

    it("should require contactEmail and subject", () => {
      expect(() =>
        CreateConversationSchema.parse({
          contactName: "John",
          firstMessage: "message",
        })
      ).toThrow();
    });

    it("should enforce message length limits", () => {
      const tooLongMessage = "A".repeat(5001);
      expect(() =>
        CreateConversationSchema.parse({
          contactEmail: "user@example.com",
          subject: "Test",
          firstMessage: tooLongMessage,
        })
      ).toThrow();
    });
  });

  describe("ValidationError", () => {
    it("should create error from Zod errors", () => {
      const zodError = { code: "too_small", path: ["name"], message: "Too short" } as any;
      const error = new ValidationError([zodError]);

      expect(error.name).toBe("ValidationError");
      expect(error.issues).toHaveLength(1);
    });

    it("should serialize to JSON with field details", () => {
      const zodError = { code: "invalid_enum_value", path: ["tier"], message: "Invalid tier" } as any;
      const error = new ValidationError([zodError]);

      const json = error.toJSON();
      expect(json.error).toBe("Validation failed");
      expect(json.details).toHaveLength(1);
      expect(json.details[0].field).toBe("tier");
    });
  });

  describe("validateRequest helper", () => {
    it("should validate valid request body", async () => {
      const mockRequest = {
        json: async () => ({ name: "Test Co", tier: "pro" }),
      } as Request;

      const result = await validateRequest(mockRequest, CreateCompanySchema);

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.name).toBe("Test Co");
      }
    });

    it("should return error for invalid request", async () => {
      const mockRequest = {
        json: async () => ({ tier: "invalid" }), // Missing required 'name'
      } as Request;

      const result = await validateRequest(mockRequest, CreateCompanySchema);

      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error).toBeInstanceOf(ValidationError);
      }
    });

    it("should handle invalid JSON", async () => {
      const mockRequest = {
        json: async () => {
          throw new SyntaxError("Unexpected token");
        },
      } as unknown as Request;

      const result = await validateRequest(mockRequest, CreateCompanySchema);

      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error.toJSON().error).toBe("Validation failed");
      }
    });
  });

  describe("Schema composition", () => {
    it("should compose schemas for partial updates", () => {
      const updateSchema = CreateCompanySchema.partial();
      const minimalUpdate = { name: "Updated Name" };

      expect(() => updateSchema.parse(minimalUpdate)).not.toThrow();
    });

    it("should preserve defaults in composed schemas", () => {
      const updateSchema = CreateCompanySchema.partial();
      const result = updateSchema.parse({ name: "Test" });

      expect(result.tier).toBe("standard"); // Zod defaults still apply after partial composition
    });
  });
});
