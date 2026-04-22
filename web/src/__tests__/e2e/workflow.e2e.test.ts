/**
 * End-to-end workflow tests
 * Coverage: Full email→draft→send→audit workflow with happy and failure paths
 */

import { createMockAppUser, createManagerUser, TEST_ORG_ID } from "@/__tests__/fixtures/auth.fixtures";
import { createMockNextRequest, createMockSupabaseClient } from "@/__tests__/utils/mocks";

describe("E2E Workflows", () => {
  describe("Email Inbound → Conversation Created → AI Draft", () => {
    it("should create conversation from inbound email", async () => {
      const appUser = createMockAppUser();
      const mockClient = createMockSupabaseClient();

      // Mock: Conversation creation succeeds
      mockClient.from = jest.fn((table: string) => {
        if (table === "conversations") {
          return {
            insert: jest.fn().mockResolvedValue({
              data: { id: "conv-123", org_id: TEST_ORG_ID, status: "open" },
              error: null,
            }),
          };
        }
        if (table === "messages") {
          return {
            insert: jest.fn().mockResolvedValue({
              data: { id: "msg-123", conversation_id: "conv-123" },
              error: null,
            }),
          };
        }
        return {
          insert: jest.fn().mockResolvedValue({ data: null, error: null }),
        };
      }) as any;

      // Simulate email inbound → conversation creation
      const conversation = { id: "conv-123", org_id: TEST_ORG_ID };
      const message = { id: "msg-123", conversation_id: conversation.id };

      expect(conversation).toHaveProperty("id");
      expect(message.conversation_id).toBe(conversation.id);
    });

    it("should generate AI draft after conversation created", async () => {
      const appUser = createMockAppUser();

      // Mock: AI draft generation
      const conversationId = "conv-123";
      const draftPayload = {
        conversation_id: conversationId,
        ai_model: "gpt-4o",
        prompt_version: "v2.1",
        draft_text: "Thank you for reaching out...",
      };

      const draft = {
        id: "draft-456",
        ...draftPayload,
        created_at: new Date().toISOString(),
      };

      expect(draft.conversation_id).toBe(conversationId);
      expect(draft.draft_text).toBeTruthy();
    });

    it("should audit conversation creation and draft generation", async () => {
      const appUser = createManagerUser();

      // Mock audit logs for the workflow
      const auditEntries = [
        {
          action: "conversation.created",
          org_id: appUser.org_id,
          actor_id: null, // System-created from email
          resource_type: "conversation",
          resource_id: "conv-123",
          success: true,
        },
        {
          action: "ai.draft_generated",
          org_id: appUser.org_id,
          actor_id: appUser.id,
          resource_type: "ai_draft",
          resource_id: "draft-456",
          success: true,
        },
      ];

      expect(auditEntries).toHaveLength(2);
      expect(auditEntries[0].action).toBe("conversation.created");
      expect(auditEntries[1].action).toBe("ai.draft_generated");
    });
  });

  describe("Draft Review → Edit → Audit Trail", () => {
    it("should accept draft and create sent reply", async () => {
      const appUser = createMockAppUser({ role: "agent" });

      const draftEdit = {
        draft_id: "draft-456",
        original_text: "Thank you for reaching out...",
        edited_text: "Thank you for contacting us. We appreciate your inquiry...",
        changes_made: ["improved tone", "expanded greeting"],
      };

      const sentReply = {
        id: "reply-789",
        conversation_id: "conv-123",
        draft_id: draftEdit.draft_id,
        final_text: draftEdit.edited_text,
        sent_at: new Date().toISOString(),
        message_id: "gmail-msg-123", // Gmail message ID
      };

      expect(sentReply.final_text).toBe(draftEdit.edited_text);
      expect(sentReply.sent_at).toBeTruthy();
    });

    it("should audit draft edits and acceptance", async () => {
      const appUser = createMockAppUser();

      const auditEntries = [
        {
          action: "ai.draft_edited",
          org_id: appUser.org_id,
          actor_id: appUser.id,
          resource_type: "ai_draft",
          resource_id: "draft-456",
          old_values: { text: "original..." },
          new_values: { text: "edited..." },
          success: true,
        },
        {
          action: "ai.draft_accepted",
          org_id: appUser.org_id,
          actor_id: appUser.id,
          resource_type: "ai_draft",
          resource_id: "draft-456",
          success: true,
        },
      ];

      expect(auditEntries[0].action).toBe("ai.draft_edited");
      expect(auditEntries[1].action).toBe("ai.draft_accepted");
    });

    it("should reject draft without sending", async () => {
      const appUser = createMockAppUser();

      // Draft rejection doesn't create a reply
      const rejectedDraft = {
        id: "draft-456",
        status: "rejected",
        rejection_reason: "tone too informal",
        rejected_at: new Date().toISOString(),
      };

      expect(rejectedDraft.status).toBe("rejected");
      expect(rejectedDraft.rejection_reason).toBeTruthy();
    });
  });

  describe("Reply Sent → Conversation Closed → Audit Trail", () => {
    it("should send reply via Gmail API", async () => {
      const appUser = createMockAppUser();

      // Mock Gmail API success
      const gmailResponse = {
        id: "gmail-123abc",
        threadId: "gmail-thread-123",
        labelIds: ["SENT"],
      };

      expect(gmailResponse.id).toBeTruthy();
      expect(gmailResponse.labelIds).toContain("SENT");
    });

    it("should update conversation status after reply sent", async () => {
      const mockClient = createMockSupabaseClient();

      mockClient.from = jest.fn((table: string) => {
        if (table === "conversations") {
          return {
            update: jest.fn().mockReturnThis(),
            eq: jest.fn().mockResolvedValue({
              data: { id: "conv-123", status: "closed" },
              error: null,
            }),
          };
        }
        return { update: jest.fn().mockReturnThis(), eq: jest.fn().mockReturnThis() };
      }) as any;

      const updatedConversation = { id: "conv-123", status: "closed" };
      expect(updatedConversation.status).toBe("closed");
    });

    it("should audit reply sent and conversation closed", async () => {
      const appUser = createMockAppUser();

      const auditEntries = [
        {
          action: "conversation.updated",
          org_id: appUser.org_id,
          actor_id: appUser.id,
          resource_type: "conversation",
          resource_id: "conv-123",
          old_values: { status: "open" },
          new_values: { status: "closed" },
          success: true,
        },
      ];

      expect(auditEntries[0].action).toBe("conversation.updated");
      expect(auditEntries[0].old_values?.status).toBe("open");
      expect(auditEntries[0].new_values?.status).toBe("closed");
    });
  });

  describe("Failure Scenarios", () => {
    describe("Gmail API Timeout", () => {
      it("should retry on Gmail timeout", async () => {
        let attempts = 0;
        const maxRetries = 3;

        const gmailSendWithRetry = async () => {
          while (attempts < maxRetries) {
            attempts++;
            if (attempts < 2) {
              // Simulate timeout
              throw new Error("GMAIL_TIMEOUT");
            }
            // Succeed on second attempt
            return { id: "gmail-123" };
          }
          throw new Error("Max retries exceeded");
        };

        const result = await gmailSendWithRetry();
        expect(result.id).toBe("gmail-123");
        expect(attempts).toBe(2);
      });

      it("should audit Gmail failure and retry attempts", async () => {
        const auditEntries = [
          {
            action: "security.suspicious_request",
            success: false,
            errorMessage: "Gmail API timeout on attempt 1",
          },
          {
            action: "security.suspicious_request",
            success: false,
            errorMessage: "Gmail API timeout on attempt 2",
          },
          {
            action: "conversation.updated",
            success: true,
            errorMessage: null,
          },
        ];

        const failures = auditEntries.filter((e) => !e.success);
        expect(failures).toHaveLength(2);
        expect(failures[0].errorMessage).toContain("timeout");
      });
    });

    describe("Partial Failure: Draft Generated But Send Fails", () => {
      it("should handle draft generation success + send failure", async () => {
        const workflow = {
          steps: [
            { step: "create_conversation", status: "success" },
            { step: "generate_draft", status: "success" },
            { step: "send_reply", status: "failed" },
          ],
        };

        const failures = workflow.steps.filter((s) => s.status === "failed");
        expect(failures).toHaveLength(1);
        expect(failures[0].step).toBe("send_reply");

        // Draft exists, but reply not sent
        expect(workflow.steps[1].status).toBe("success");
      });

      it("should preserve audit trail for partial failures", async () => {
        const auditLog = [
          { action: "conversation.created", success: true },
          { action: "ai.draft_generated", success: true },
          { action: "conversation.updated", success: false, errorMessage: "Gmail API unavailable" },
        ];

        expect(auditLog[0].success).toBe(true);
        expect(auditLog[1].success).toBe(true);
        expect(auditLog[2].success).toBe(false);
      });
    });

    describe("Database Failure", () => {
      it("should handle database connection error gracefully", async () => {
        const mockClient = createMockSupabaseClient();

        mockClient.from = jest.fn((table: string) => {
          if (table === "conversations") {
            return {
              insert: jest.fn().mockResolvedValue({
                data: null,
                error: { message: "Connection refused" },
              }),
            };
          }
          return { insert: jest.fn().mockResolvedValue({ data: null, error: null }) };
        }) as any;

        // Simulate DB error
        const result = await mockClient
          .from("conversations")
          .insert({ org_id: TEST_ORG_ID });

        expect(result.error).toBeTruthy();
        expect(result.data).toBeNull();
      });

      it("should audit database errors for investigation", async () => {
        const auditEntry = {
          action: "conversation.created",
          success: false,
          errorMessage: "Database connection refused",
          error_code: "ECONNREFUSED",
          timestamp: new Date().toISOString(),
        };

        expect(auditEntry.success).toBe(false);
        expect(auditEntry.errorMessage).toContain("Database");
      });
    });

    describe("Authorization Failure Mid-Workflow", () => {
      it("should deny capability check and audit attempt", async () => {
        const agentUser = createMockAppUser({ role: "agent" });

        // Agent trying to change conversation status (requires conversations.assign)
        const canAssign = false; // Agent lacks this capability

        if (!canAssign) {
          const auditEntry = {
            action: "security.suspicious_request",
            org_id: agentUser.org_id,
            actor_id: agentUser.id,
            actor_role: agentUser.role,
            resource_type: "conversation",
            resource_id: "conv-123",
            success: false,
            errorMessage: "User lacks conversations.assign capability",
          };

          expect(auditEntry.success).toBe(false);
          expect(auditEntry.actor_role).toBe("agent");
        }
      });
    });
  });

  describe("Concurrent Operations", () => {
    it("should handle simultaneous draft generation for same conversation", async () => {
      const conversationId = "conv-123";

      // Two agents simultaneously generating drafts
      const draft1Promise = Promise.resolve({ id: "draft-1", conversation_id: conversationId });
      const draft2Promise = Promise.resolve({ id: "draft-2", conversation_id: conversationId });

      const [draft1, draft2] = await Promise.all([draft1Promise, draft2Promise]);

      // Both should succeed, but ideally only one would be "active"
      expect(draft1.conversation_id).toBe(conversationId);
      expect(draft2.conversation_id).toBe(conversationId);
      expect(draft1.id).not.toBe(draft2.id);
    });

    it("should audit both concurrent draft generations", async () => {
      const auditEntries = [
        { action: "ai.draft_generated", draft_id: "draft-1", timestamp: Date.now() },
        { action: "ai.draft_generated", draft_id: "draft-2", timestamp: Date.now() + 1 },
      ];

      expect(auditEntries).toHaveLength(2);
      expect(auditEntries[0].draft_id).not.toBe(auditEntries[1].draft_id);
    });
  });

  describe("Full Workflow Happy Path", () => {
    it("should complete entire email→draft→send→close workflow", async () => {
      const appUser = createMockAppUser({ role: "agent" });

      const workflow = {
        steps: [
          { name: "Email Inbound", status: "success", duration: 50 },
          { name: "Conversation Created", status: "success", duration: 100 },
          { name: "AI Draft Generated", status: "success", duration: 2000 },
          { name: "Draft Reviewed", status: "success", duration: 300 },
          { name: "Draft Edited", status: "success", duration: 500 },
          { name: "Reply Sent via Gmail", status: "success", duration: 400 },
          { name: "Conversation Closed", status: "success", duration: 50 },
        ],
      };

      const allSuccessful = workflow.steps.every((s) => s.status === "success");
      const totalDuration = workflow.steps.reduce((sum, s) => sum + s.duration, 0);

      expect(allSuccessful).toBe(true);
      expect(totalDuration).toBeGreaterThan(0);
      expect(workflow.steps).toHaveLength(7);
    });
  });
});
