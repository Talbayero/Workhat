/**
 * Data Integrity and State Machine Tests
 *
 * Coverage:
 * - Conversation state transitions (state machine validation)
 * - Cascade deletes and data cleanup
 * - Denormalized field synchronization
 * - Constraint enforcement
 * - Concurrent write operations
 * - Referential integrity
 */

import { createClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/database.types";

// Test utilities
const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL || "";
const SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || "";

const supabase = createClient<Database>(SUPABASE_URL, SERVICE_ROLE_KEY, {
  auth: { autoRefreshToken: false, persistSession: false },
});

// Helper to clean up test data
async function cleanupTestData(orgId: string) {
  await supabase.from("conversations").delete().eq("org_id", orgId);
  await supabase.from("messages").delete().eq("org_id", orgId);
  await supabase.from("contacts").delete().eq("org_id", orgId);
  await supabase.from("companies").delete().eq("org_id", orgId);
}

// Create test fixtures
async function createTestOrg() {
  const { data } = await supabase
    .from("organizations")
    .insert({ name: `Test-${Date.now()}` })
    .select("id")
    .single();
  return data?.id || "";
}

async function createTestChannel(orgId: string) {
  const { data } = await supabase
    .from("channels")
    .insert({
      org_id: orgId,
      name: "test-channel",
      type: "email",
      status: "active",
    })
    .select("id")
    .single();
  return data?.id || "";
}

async function createTestConversation(orgId: string, channelId: string) {
  const { data } = await supabase
    .from("conversations")
    .insert({
      org_id: orgId,
      channel_id: channelId,
      subject: "Test conversation",
      status: "open",
    })
    .select("*")
    .single();
  return data;
}

async function createTestMessage(
  orgId: string,
  conversationId: string,
  content: string
) {
  const { data } = await supabase
    .from("messages")
    .insert({
      org_id: orgId,
      conversation_id: conversationId,
      sender_type: "customer",
      direction: "inbound",
      author_name: "Test Customer",
      body_text: content,
    })
    .select("*")
    .single();
  return data;
}

describe("Data Integrity and State Machine Tests", () => {
  let testOrgId: string;
  let testChannelId: string;

  beforeAll(async () => {
    testOrgId = await createTestOrg();
    testChannelId = await createTestChannel(testOrgId);
  });

  afterAll(async () => {
    await cleanupTestData(testOrgId);
  });

  describe("Conversation State Machine", () => {
    it("should start conversation in 'open' state", async () => {
      const conv = await createTestConversation(testOrgId, testChannelId);
      expect(conv?.status).toBe("open");
    });

    it("should allow transition from open to closed", async () => {
      const conv = await createTestConversation(testOrgId, testChannelId);
      const { data: updated } = await supabase
        .from("conversations")
        .update({ status: "closed" })
        .eq("id", conv?.id)
        .select("status")
        .single();

      expect(updated?.status).toBe("closed");
    });

    it("should allow transition from open to waiting_on_customer", async () => {
      const conv = await createTestConversation(testOrgId, testChannelId);
      const { data: updated } = await supabase
        .from("conversations")
        .update({ status: "waiting_on_customer" })
        .eq("id", conv?.id)
        .select("status")
        .single();

      expect(updated?.status).toBe("waiting_on_customer");
    });

    it("should allow transition from waiting_on_customer to open", async () => {
      const conv = await createTestConversation(testOrgId, testChannelId);
      await supabase
        .from("conversations")
        .update({ status: "waiting_on_customer" })
        .eq("id", conv?.id);

      const { data: updated } = await supabase
        .from("conversations")
        .update({ status: "open" })
        .eq("id", conv?.id)
        .select("status")
        .single();

      expect(updated?.status).toBe("open");
    });

    it("should allow transition from waiting_on_internal to closed", async () => {
      const conv = await createTestConversation(testOrgId, testChannelId);
      await supabase
        .from("conversations")
        .update({ status: "waiting_on_internal" })
        .eq("id", conv?.id);

      const { data: updated } = await supabase
        .from("conversations")
        .update({ status: "closed" })
        .eq("id", conv?.id)
        .select("status")
        .single();

      expect(updated?.status).toBe("closed");
    });

    it("should maintain status on other field updates", async () => {
      const conv = await createTestConversation(testOrgId, testChannelId);
      await supabase
        .from("conversations")
        .update({ status: "waiting_on_customer" })
        .eq("id", conv?.id);

      const { data: updated } = await supabase
        .from("conversations")
        .update({ subject: "Updated subject" })
        .eq("id", conv?.id)
        .select("status, subject")
        .single();

      expect(updated?.status).toBe("waiting_on_customer");
      expect(updated?.subject).toBe("Updated subject");
    });
  });

  describe("Message Cascade and Cleanup", () => {
    it("should delete messages when conversation is deleted", async () => {
      const conv = await createTestConversation(testOrgId, testChannelId);
      await createTestMessage(testOrgId, conv?.id || "", "Test message");

      const { data: messagesBeforeDelete } = await supabase
        .from("messages")
        .select("id")
        .eq("conversation_id", conv?.id);

      expect(messagesBeforeDelete?.length).toBe(1);

      await supabase.from("conversations").delete().eq("id", conv?.id);

      const { data: messagesAfterDelete } = await supabase
        .from("messages")
        .select("id")
        .eq("conversation_id", conv?.id);

      expect(messagesAfterDelete?.length).toBe(0);
    });

    it("should enforce message_org_conversation_created index", async () => {
      const conv = await createTestConversation(testOrgId, testChannelId);
      const msg1 = await createTestMessage(
        testOrgId,
        conv?.id || "",
        "Message 1"
      );
      const msg2 = await createTestMessage(
        testOrgId,
        conv?.id || "",
        "Message 2"
      );

      expect(msg1?.id).not.toBe(msg2?.id);
      expect(msg1?.created_at !== msg2?.created_at || msg1?.id < msg2?.id).toBe(
        true
      );
    });

    it("should maintain message ordering by created_at", async () => {
      const conv = await createTestConversation(testOrgId, testChannelId);
      const msg1 = await createTestMessage(
        testOrgId,
        conv?.id || "",
        "First"
      );

      // Small delay to ensure different timestamps
      await new Promise((resolve) => setTimeout(resolve, 10));

      const msg2 = await createTestMessage(
        testOrgId,
        conv?.id || "",
        "Second"
      );

      const { data: messages } = await supabase
        .from("messages")
        .select("*")
        .eq("conversation_id", conv?.id)
        .order("created_at", { ascending: true });

      expect(messages?.[0]?.id).toBe(msg1?.id);
      expect(messages?.[1]?.id).toBe(msg2?.id);
    });
  });

  describe("Denormalized Field Synchronization", () => {
    it("should maintain empty assigned_to_name when no user assigned", async () => {
      const conv = await createTestConversation(testOrgId, testChannelId);
      expect(conv?.assigned_to_name).toBe("");
      expect(conv?.assigned_user_id).toBeNull();
    });

    it("should preserve assigned_to_name when updating other fields", async () => {
      const conv = await createTestConversation(testOrgId, testChannelId);
      const { data: updated } = await supabase
        .from("conversations")
        .update({
          assigned_to_name: "John Doe",
          status: "waiting_on_customer",
        })
        .eq("id", conv?.id)
        .select("assigned_to_name, status")
        .single();

      expect(updated?.assigned_to_name).toBe("John Doe");
      expect(updated?.status).toBe("waiting_on_customer");
    });

    it("should allow clearing assigned_to_name", async () => {
      const conv = await createTestConversation(testOrgId, testChannelId);
      await supabase
        .from("conversations")
        .update({ assigned_to_name: "Jane Smith" })
        .eq("id", conv?.id);

      const { data: updated } = await supabase
        .from("conversations")
        .update({ assigned_to_name: "" })
        .eq("id", conv?.id)
        .select("assigned_to_name")
        .single();

      expect(updated?.assigned_to_name).toBe("");
    });
  });

  describe("Constraint Enforcement", () => {
    it("should reject agent messages without sender_user_id", async () => {
      const conv = await createTestConversation(testOrgId, testChannelId);
      const { error } = await supabase.from("messages").insert({
        org_id: testOrgId,
        conversation_id: conv?.id,
        sender_type: "agent",
        direction: "outbound",
        author_name: "Agent",
        body_text: "Response",
        sender_user_id: null, // This should violate the check constraint
      });

      // The constraint should prevent this
      expect(error).not.toBeNull();
    });

    it("should allow customer messages without sender_user_id", async () => {
      const conv = await createTestConversation(testOrgId, testChannelId);
      const { error } = await supabase.from("messages").insert({
        org_id: testOrgId,
        conversation_id: conv?.id,
        sender_type: "customer",
        direction: "inbound",
        author_name: "Customer",
        body_text: "Message",
        sender_user_id: null,
      });

      expect(error).toBeNull();
    });

    it("should enforce message_direction enum", async () => {
      const conv = await createTestConversation(testOrgId, testChannelId);
      const { error } = await supabase.from("messages").insert({
        org_id: testOrgId,
        conversation_id: conv?.id,
        sender_type: "customer",
        direction: "invalid_direction" as any, // Invalid enum
        author_name: "Test",
        body_text: "Test",
      });

      expect(error).not.toBeNull();
    });

    it("should enforce conversation_status enum", async () => {
      const conv = await createTestConversation(testOrgId, testChannelId);
      const { error } = await supabase
        .from("conversations")
        .update({ status: "invalid_status" as any })
        .eq("id", conv?.id);

      expect(error).not.toBeNull();
    });
  });

  describe("Referential Integrity", () => {
    it("should maintain org_id consistency across related records", async () => {
      const conv = await createTestConversation(testOrgId, testChannelId);
      const msg = await createTestMessage(
        testOrgId,
        conv?.id || "",
        "Test"
      );

      expect(msg?.org_id).toBe(testOrgId);
      expect(conv?.org_id).toBe(testOrgId);
    });

    it("should set contact_id to null when contact is deleted", async () => {
      const conv = await createTestConversation(testOrgId, testChannelId);

      // Create a contact
      const { data: contact } = await supabase
        .from("contacts")
        .insert({
          org_id: testOrgId,
          email: `test-${Date.now()}@example.com`,
          full_name: "Test Contact",
        })
        .select("id")
        .single();

      // Assign contact to conversation
      await supabase
        .from("conversations")
        .update({ contact_id: contact?.id })
        .eq("id", conv?.id);

      // Delete the contact
      await supabase.from("contacts").delete().eq("id", contact?.id);

      // Check that contact_id is now null
      const { data: updated } = await supabase
        .from("conversations")
        .select("contact_id")
        .eq("id", conv?.id)
        .single();

      expect(updated?.contact_id).toBeNull();
    });

    it("should set company_id to null when company is deleted", async () => {
      const conv = await createTestConversation(testOrgId, testChannelId);

      // Create a company
      const { data: company } = await supabase
        .from("companies")
        .insert({
          org_id: testOrgId,
          name: `Test Company ${Date.now()}`,
        })
        .select("id")
        .single();

      // Assign company to conversation
      await supabase
        .from("conversations")
        .update({ company_id: company?.id })
        .eq("id", conv?.id);

      // Delete the company
      await supabase.from("companies").delete().eq("id", company?.id);

      // Check that company_id is now null
      const { data: updated } = await supabase
        .from("conversations")
        .select("company_id")
        .eq("id", conv?.id)
        .single();

      expect(updated?.company_id).toBeNull();
    });
  });

  describe("Concurrent Operations", () => {
    it("should handle concurrent message creation safely", async () => {
      const conv = await createTestConversation(testOrgId, testChannelId);

      const promises = Array.from({ length: 5 }, (_, i) =>
        createTestMessage(testOrgId, conv?.id || "", `Message ${i + 1}`)
      );

      const messages = await Promise.all(promises);

      expect(messages.length).toBe(5);
      expect(new Set(messages.map((m) => m?.id)).size).toBe(5); // All unique
    });

    it("should handle concurrent conversation updates safely", async () => {
      const conv = await createTestConversation(testOrgId, testChannelId);

      const updates = [
        { status: "waiting_on_customer" as const },
        { priority: "high" },
        { risk_level: "red" as const },
      ];

      const promises = updates.map((update) =>
        supabase
          .from("conversations")
          .update(update)
          .eq("id", conv?.id)
          .select("*")
          .single()
      );

      const results = await Promise.all(promises);

      // All updates should succeed (last one wins)
      results.forEach((result) => {
        expect(result.error).toBeNull();
      });

      // Verify final state has all updates applied
      const { data: final } = await supabase
        .from("conversations")
        .select("status, priority, risk_level")
        .eq("id", conv?.id)
        .single();

      expect(final?.priority).toBe("high");
      expect(final?.risk_level).toBe("red");
      expect(final?.status).toBe("waiting_on_customer");
    });

    it("should handle concurrent message and conversation updates", async () => {
      const conv = await createTestConversation(testOrgId, testChannelId);

      const promises = [
        createTestMessage(testOrgId, conv?.id || "", "Message 1"),
        createTestMessage(testOrgId, conv?.id || "", "Message 2"),
        supabase
          .from("conversations")
          .update({ status: "waiting_on_customer" })
          .eq("id", conv?.id)
          .select("*")
          .single(),
      ];

      const results = await Promise.all(promises);

      expect(results[0]?.id).toBeDefined(); // Message 1
      expect(results[1]?.id).toBeDefined(); // Message 2
      expect((results[2] as any).data?.status).toBe("waiting_on_customer");
    });
  });

  describe("Data Consistency Edge Cases", () => {
    it("should preserve tags jsonb format", async () => {
      const conv = await createTestConversation(testOrgId, testChannelId);
      const tags = ["urgent", "vip", "follow-up"];

      const { data: updated } = await supabase
        .from("conversations")
        .update({ tags })
        .eq("id", conv?.id)
        .select("tags")
        .single();

      expect(Array.isArray(updated?.tags)).toBe(true);
      expect(updated?.tags).toEqual(tags);
    });

    it("should maintain preview text field", async () => {
      const conv = await createTestConversation(testOrgId, testChannelId);
      const preview = "This is a preview of the conversation";

      const { data: updated } = await supabase
        .from("conversations")
        .update({ preview })
        .eq("id", conv?.id)
        .select("preview")
        .single();

      expect(updated?.preview).toBe(preview);
    });

    it("should allow null values for optional fields", async () => {
      const conv = await createTestConversation(testOrgId, testChannelId);

      const { data: updated } = await supabase
        .from("conversations")
        .update({
          subject: null,
          contact_id: null,
          company_id: null,
          assigned_user_id: null,
        })
        .eq("id", conv?.id)
        .select("subject, contact_id, company_id, assigned_user_id")
        .single();

      expect(updated?.subject).toBeNull();
      expect(updated?.contact_id).toBeNull();
      expect(updated?.company_id).toBeNull();
      expect(updated?.assigned_user_id).toBeNull();
    });

    it("should update updated_at timestamp on modification", async () => {
      const conv = await createTestConversation(testOrgId, testChannelId);
      const originalUpdatedAt = conv?.updated_at;

      await new Promise((resolve) => setTimeout(resolve, 100));

      const { data: updated } = await supabase
        .from("conversations")
        .update({ subject: "New subject" })
        .eq("id", conv?.id)
        .select("updated_at")
        .single();

      expect(updated?.updated_at).not.toBe(originalUpdatedAt);
      expect(new Date(updated?.updated_at || 0).getTime())
        .toBeGreaterThan(new Date(originalUpdatedAt || 0).getTime());
    });
  });
});
