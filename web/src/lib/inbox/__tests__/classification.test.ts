import {
  classifyImportedEmail,
  isDefaultOperationalConversation,
} from "@/lib/inbox/classification";
import type { InboxConversation } from "@/lib/inbox/types";

function makeConversation(
  overrides: Partial<InboxConversation>,
): InboxConversation {
  return {
    id: "conversation-1",
    contactId: "contact-1",
    customerName: "Customer",
    companyId: "company-1",
    companyName: "Company",
    subject: "Need help",
    preview: "Can you help me?",
    status: "open",
    channel: "email",
    riskLevel: "green",
    aiConfidence: "green",
    assignee: "",
    lastSeen: "just now",
    tags: [],
    intent: "support",
    messages: [],
    aiDraft: {
      rationale: "",
      missingContext: [],
      suggestions: [],
      draftText: "",
    },
    profile: {
      email: "customer@example.com",
      phone: "",
      tier: "",
      notes: [],
      openIssues: [],
    },
    ...overrides,
  };
}

describe("Gmail inbox classification", () => {
  it("classifies deterministic automated and human messages", () => {
    expect(classifyImportedEmail({
      senderEmail: "no-reply@github.com",
      subject: "Notification: issue updated",
    })).toBe("system_notification");

    expect(classifyImportedEmail({
      senderEmail: "security@example.com",
      subject: "Your verification code",
    })).toBe("auth_email");

    expect(classifyImportedEmail({
      senderEmail: "news@example.com",
      subject: "Weekly newsletter",
      preview: "unsubscribe anytime",
    })).toBe("newsletter");

    expect(classifyImportedEmail({
      senderEmail: "ada@example.com",
      subject: "Question about onboarding",
    })).toBe("human_customer");
  });

  it("keeps human and unknown conversations in the default operational queue", () => {
    const human = makeConversation({ id: "human", emailClassification: "human_customer" });
    const unknown = makeConversation({
      id: "unknown",
      emailClassification: "unknown",
      profile: { email: "", phone: "", tier: "", notes: [], openIssues: [] },
    });
    const system = makeConversation({
      id: "system",
      emailClassification: "system_notification",
      profile: { email: "no-reply@github.com", phone: "", tier: "", notes: [], openIssues: [] },
    });

    expect(isDefaultOperationalConversation(system)).toBe(false);
    expect([human, unknown, system].filter(isDefaultOperationalConversation).map((item) => item.id))
      .toEqual(["human", "unknown"]);
  });
});
