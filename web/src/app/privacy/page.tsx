import type { Metadata } from "next";
import Link from "next/link";

export const metadata: Metadata = {
  title: "Privacy - Work Hat",
  description: "How Work Hat handles account, Gmail, conversation, AI draft, and improvement data.",
};

const sections = [
  {
    title: "Data Work Hat Collects",
    body: [
      "Work Hat stores account information such as your name, email address, role, organization, and team membership.",
      "When your workspace uses Work Hat, we store CRM data such as companies, contacts, conversations, messages, knowledge entries, AI drafts, edit analysis, QA review records, and audit events.",
      "We also store operational metadata needed to run the product, such as timestamps, conversation status, assignment, SLA state, and feature usage events.",
    ],
  },
  {
    title: "Gmail OAuth Access",
    body: [
      "Gmail OAuth is the only self-serve mailbox connection path in the Work Hat MVP.",
      "Work Hat requests Gmail access so it can import recent inbox messages into conversations and send replies that a human user has approved.",
      "Work Hat separates your Work Hat account identity from the connected Gmail mailbox identity. Connecting Gmail lets Work Hat operate on that mailbox for the workspace; it does not change who you use to sign in to Work Hat.",
      "You can disconnect Gmail from Settings. You can also revoke Work Hat access from your Google Account security settings.",
    ],
  },
  {
    title: "AI Drafts And Edit Analysis",
    body: [
      "Work Hat uses conversation context, selected knowledge, and selected context objects to generate suggested reply drafts.",
      "AI drafts are suggestions. Work Hat does not send autonomous customer replies. A human user must review, edit, and approve a reply before it is sent.",
      "After a reply is sent, Work Hat may compare the AI draft with the human-approved final reply to understand what changed and improve future drafting guidance.",
      "AI outputs are stored with traceability information such as prompt version, conversation, selected context, and edit analysis where available.",
    ],
  },
  {
    title: "Security Handling",
    body: [
      "Work Hat uses organization-scoped access controls so users only access data for their workspace.",
      "Gmail OAuth tokens and provider credentials are treated as restricted secrets and are not shown in the browser.",
      "Security-relevant actions may be recorded in audit logs, including actor, action, target resource, timestamp, and request metadata where available.",
    ],
  },
  {
    title: "Deletion And Export Requests",
    body: [
      "Workspace owners and authorized users may request export or deletion of account and workspace data by contacting Work Hat.",
      "Some records may need to be retained for security, audit, billing, or legal reasons. Work Hat will explain any retention requirement when responding to a request.",
      "To request export, deletion, or correction, contact info@work-hat.com from the email address associated with your Work Hat account.",
    ],
  },
];

export default function PrivacyPage() {
  return (
    <main className="min-h-screen bg-[var(--background)] px-6 py-10 text-[var(--foreground)]">
      <div className="mx-auto max-w-3xl">
        <Link href="/en" className="inline-flex items-center gap-2 text-sm text-[var(--muted)] hover:text-[var(--foreground)]">
          Work Hat
        </Link>
        <header className="mt-10 border-b border-[var(--line)] pb-8">
          <p className="eyebrow text-[10px] text-[var(--muted)]">Privacy</p>
          <h1 className="mt-3 text-3xl font-semibold tracking-tight">Privacy Policy</h1>
          <p className="mt-4 text-sm leading-6 text-[var(--muted)]">
            This page explains how Work Hat handles data for its conversation-first CRM and AI-assisted support workflows. It is a product privacy notice, not a certification statement.
          </p>
          <p className="mt-3 text-xs text-[var(--muted)]">Last updated: April 2026</p>
        </header>

        <div className="divide-y divide-[var(--line)]">
          {sections.map((section) => (
            <section key={section.title} className="py-7">
              <h2 className="text-lg font-semibold">{section.title}</h2>
              <div className="mt-3 space-y-3">
                {section.body.map((paragraph) => (
                  <p key={paragraph} className="text-sm leading-6 text-[var(--muted)]">
                    {paragraph}
                  </p>
                ))}
              </div>
            </section>
          ))}
        </div>

        <footer className="border-t border-[var(--line)] py-6 text-xs text-[var(--muted)]">
          <Link href="/account-deletion" className="hover:text-[var(--foreground)]">
            Account deletion and data requests
          </Link>
        </footer>
      </div>
    </main>
  );
}
