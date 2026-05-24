import {
  getAiDraftDisabledReason,
  getLatestInboundCustomerMessage,
  getMessagePresentation,
  getReplyingToBody,
  getSendDisabledReason,
  shouldOfferFullThread,
} from "@/lib/inbox/thread-ui";
import type { InboxConversation } from "@/lib/inbox/types";

type Message = InboxConversation["messages"][number];

const customerMessage: Message = {
  id: "customer-1",
  sender: "Ada Customer",
  senderType: "customer",
  timestamp: "10:01",
  body: "Can you help me update my account?",
};

describe("thread workspace helpers", () => {
  it("finds the latest inbound customer message for the active customer message panel", () => {
    const latest = {
      ...customerMessage,
      id: "customer-2",
      body: "This is the message that needs a reply.",
    };

    expect(getLatestInboundCustomerMessage([
      customerMessage,
      { id: "agent-1", sender: "Agent", senderType: "agent", timestamp: "10:02", body: "Sure." },
      latest,
    ])).toEqual(latest);
  });

  it("supports compact active-message previews with explicit expansion", () => {
    const longBody = "A".repeat(600);

    expect(shouldOfferFullThread(longBody)).toBe(true);
    expect(getReplyingToBody(longBody, false)).toHaveLength(523);
    expect(getReplyingToBody(longBody, true)).toBe(longBody);
  });

  it("separates internal notes and activity from outbound customer replies", () => {
    expect(getMessagePresentation(customerMessage)).toBe("customer_message");
    expect(getMessagePresentation({
      id: "agent-1",
      sender: "Agent",
      senderType: "agent",
      timestamp: "10:02",
      body: "Customer-facing response.",
    })).toBe("agent_reply");
    expect(getMessagePresentation({
      id: "note-1",
      sender: "Internal note",
      senderType: "internal",
      timestamp: "10:03",
      body: "Discuss this privately.",
    })).toBe("internal_note");
    expect(getMessagePresentation({
      id: "closure-1",
      sender: "Internal note",
      senderType: "internal",
      timestamp: "10:04",
      body: "[Closure note] Resolved after account update.",
    })).toBe("activity");
  });

  it("returns visible Send button disabled reasons", () => {
    expect(getSendDisabledReason({
      status: "open",
      replyText: "",
      latestInboundMessage: customerMessage,
      mode: "reply",
    })).toBe("Write a reply before sending.");

    expect(getSendDisabledReason({
      status: "closed",
      replyText: "Thanks",
      latestInboundMessage: customerMessage,
      mode: "reply",
    })).toContain("Reopen");

    expect(getSendDisabledReason({
      status: "open",
      replyText: "Internal only",
      latestInboundMessage: null,
      mode: "note",
    })).toBeNull();
  });

  it("returns visible AI Draft disabled reasons", () => {
    expect(getAiDraftDisabledReason({
      status: "open",
      latestInboundMessage: null,
      draftLoading: false,
    })).toContain("No latest inbound");

    expect(getAiDraftDisabledReason({
      status: "closed",
      latestInboundMessage: customerMessage,
      draftLoading: false,
    })).toContain("Reopen");
  });
});
