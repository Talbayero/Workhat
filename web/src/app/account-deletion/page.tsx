import type { Metadata } from "next";
import Link from "next/link";

export const metadata: Metadata = {
  title: "Account Deletion - Work Hat",
  description: "How to request Work Hat account deletion, workspace data deletion, export, or Gmail disconnection.",
};

export default function AccountDeletionPage() {
  return (
    <main className="min-h-screen bg-[var(--background)] px-6 py-10 text-[var(--foreground)]">
      <div className="mx-auto max-w-3xl">
        <Link href="/en" className="inline-flex text-sm text-[var(--muted)] hover:text-[var(--foreground)]">
          Work Hat
        </Link>
        <header className="mt-10 border-b border-[var(--line)] pb-8">
          <p className="eyebrow text-[10px] text-[var(--muted)]">Data requests</p>
          <h1 className="mt-3 text-3xl font-semibold tracking-tight">Account Deletion And Data Requests</h1>
          <p className="mt-4 text-sm leading-6 text-[var(--muted)]">
            Work Hat supports requests to delete, export, or correct account and workspace data. Requests are reviewed so workspace ownership, security, audit, and legal retention requirements are handled correctly.
          </p>
        </header>

        <section className="border-b border-[var(--line)] py-7">
          <h2 className="text-lg font-semibold">How To Request Deletion Or Export</h2>
          <p className="mt-3 text-sm leading-6 text-[var(--muted)]">
            Email info@work-hat.com from the email address associated with your Work Hat account. Include whether you are requesting account deletion, workspace deletion, data export, correction, or Gmail disconnection support.
          </p>
          <p className="mt-3 text-sm leading-6 text-[var(--muted)]">
            If you are requesting deletion for an organization workspace, Work Hat may need confirmation from a workspace owner or authorized administrator before deleting shared CRM, conversation, or mailbox data.
          </p>
        </section>

        <section className="border-b border-[var(--line)] py-7">
          <h2 className="text-lg font-semibold">Gmail Disconnection</h2>
          <p className="mt-3 text-sm leading-6 text-[var(--muted)]">
            You can disconnect Gmail from Work Hat in Settings. You can also revoke Work Hat access directly from your Google Account security settings.
          </p>
          <p className="mt-3 text-sm leading-6 text-[var(--muted)]">
            Disconnecting Gmail stops new mailbox sync and sending through that connected mailbox. Existing imported conversations may remain in the workspace until they are deleted under the workspace data process.
          </p>
        </section>

        <section className="py-7">
          <h2 className="text-lg font-semibold">What May Be Retained</h2>
          <p className="mt-3 text-sm leading-6 text-[var(--muted)]">
            Some records may be retained when needed for security, audit logs, billing records, abuse prevention, or legal obligations. Work Hat will avoid retaining more data than needed for those purposes.
          </p>
          <p className="mt-3 text-sm leading-6 text-[var(--muted)]">
            For privacy details, read the <Link href="/privacy" className="text-[var(--moss)] hover:underline">Privacy Policy</Link>.
          </p>
        </section>
      </div>
    </main>
  );
}
