import "server-only";

export type ConversationNotificationTemplateInput = {
  recipientName?: string | null;
  companyName: string;
  contactName?: string | null;
  conversationSubject?: string | null;
  conversationUrl: string;
  assignedBy?: string | null;
};

function escapeHtml(value: string) {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function paragraph(label: string, value: string) {
  return `<p style="margin: 0 0 10px;"><strong>${escapeHtml(label)}:</strong> ${escapeHtml(value)}</p>`;
}

function wrapEmail(body: string) {
  return `
    <div style="font-family: system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; line-height: 1.5; color: #111827; max-width: 560px;">
      ${body}
    </div>
  `;
}

function recipientGreeting(name?: string | null) {
  const safeName = typeof name === "string" ? name.trim() : "";
  return safeName ? `<p style="margin: 0 0 16px;">Hi ${escapeHtml(safeName)},</p>` : `<p style="margin: 0 0 16px;">Hi,</p>`;
}

function assignedByLine(assignedBy?: string | null) {
  const safe = typeof assignedBy === "string" ? assignedBy.trim() : "";
  return safe ? paragraph("Assigned by", safe) : "";
}

function optionalParagraph(label: string, value?: string | null) {
  return value ? paragraph(label, value) : "";
}

export function buildConversationAssignedSubject(companyName: string, conversationSubject?: string | null) {
  return conversationSubject ? `${companyName} - ${conversationSubject}` : `${companyName} - Conversation assigned`;
}

export function buildQaFollowUpSubject(companyName: string, conversationSubject?: string | null) {
  return conversationSubject ? `${companyName} - QA follow-up: ${conversationSubject}` : `${companyName} - QA follow-up`;
}

export function renderConversationAssignedEmail(input: ConversationNotificationTemplateInput) {
  return wrapEmail(`
    ${recipientGreeting(input.recipientName)}
    <p style="margin: 0 0 16px;">A conversation has been assigned to you.</p>
    ${paragraph("Company", input.companyName)}
    ${optionalParagraph("Customer", input.contactName)}
    ${optionalParagraph("Conversation", input.conversationSubject)}
    ${assignedByLine(input.assignedBy)}
    <p style="margin: 18px 0 0;">
      <a href="${escapeHtml(input.conversationUrl)}" style="color: #7f1d1d; text-decoration: underline;">View conversation</a>
    </p>
  `);
}

export function renderQaFollowUpEmail(input: ConversationNotificationTemplateInput) {
  return wrapEmail(`
    ${recipientGreeting(input.recipientName)}
    <p style="margin: 0 0 16px;">You have a QA follow-up to review.</p>
    ${paragraph("Company", input.companyName)}
    ${optionalParagraph("Customer", input.contactName)}
    ${optionalParagraph("Conversation", input.conversationSubject)}
    ${assignedByLine(input.assignedBy)}
    <p style="margin: 18px 0 0;">
      <a href="${escapeHtml(input.conversationUrl)}" style="color: #7f1d1d; text-decoration: underline;">Review conversation</a>
    </p>
  `);
}
