"use client";

import Link from "next/link";
import { type ReactNode, useState } from "react";

type EmailConnectionMethod = "oauth" | "mailbox_password" | "app_password" | "imap_smtp";

type NoticeHandler = (message: string) => void;

type EmailConnectionSetupProps = {
  canEdit?: boolean;
  returnTo: string;
  onSaved?: () => void | Promise<void>;
  onNotice?: NoticeHandler;
  onError?: NoticeHandler;
};

type MailboxForm = {
  email: string;
  password: string;
  providerHint: string;
  senderName: string;
};

type AppPasswordForm = {
  email: string;
  appPassword: string;
  providerHint: string;
  senderName: string;
};

type ImapSmtpForm = {
  email: string;
  username: string;
  password: string;
  providerHint: string;
  senderName: string;
  imapHost: string;
  imapPort: string;
  imapSsl: boolean;
  smtpHost: string;
  smtpPort: string;
  smtpSsl: boolean;
};

const METHODS: Array<{
  key: EmailConnectionMethod;
  title: string;
  eyebrow: string;
  body: string;
}> = [
  {
    key: "oauth",
    title: "OAuth / xOAuth",
    eyebrow: "Gmail + Microsoft 365",
    body: "Connect a mailbox with a secure provider approval. Best for Google Workspace and Microsoft 365.",
  },
  {
    key: "mailbox_password",
    title: "Mailbox login and password",
    eyebrow: "Simple mailbox auth",
    body: "Use the mailbox address and password when the provider allows direct mailbox authentication.",
  },
  {
    key: "app_password",
    title: "App password",
    eyebrow: "2FA-friendly",
    body: "Use a provider-issued app password for Gmail, Outlook, iCloud, and similar mailboxes.",
  },
  {
    key: "imap_smtp",
    title: "IMAP / SMTP",
    eyebrow: "Company mail servers",
    body: "Enter host, port, and TLS settings for Zoho, cPanel, private servers, or hosted corporate mail.",
  },
];

function emptyMailboxForm(): MailboxForm {
  return { email: "", password: "", providerHint: "", senderName: "" };
}

function emptyAppPasswordForm(): AppPasswordForm {
  return { email: "", appPassword: "", providerHint: "gmail", senderName: "" };
}

function emptyImapSmtpForm(): ImapSmtpForm {
  return {
    email: "",
    username: "",
    password: "",
    providerHint: "custom",
    senderName: "",
    imapHost: "",
    imapPort: "993",
    imapSsl: true,
    smtpHost: "",
    smtpPort: "587",
    smtpSsl: true,
  };
}

export function EmailConnectionSetup({
  canEdit = true,
  returnTo,
  onSaved,
  onNotice,
  onError,
}: EmailConnectionSetupProps) {
  const [selected, setSelected] = useState<EmailConnectionMethod>("oauth");
  const [saving, setSaving] = useState<EmailConnectionMethod | null>(null);
  const [mailbox, setMailbox] = useState<MailboxForm>(emptyMailboxForm);
  const [appPassword, setAppPassword] = useState<AppPasswordForm>(emptyAppPasswordForm);
  const [imapSmtp, setImapSmtp] = useState<ImapSmtpForm>(emptyImapSmtpForm);
  const [localMessage, setLocalMessage] = useState<{ type: "success" | "error"; message: string } | null>(null);

  async function saveConnection(method: Exclude<EmailConnectionMethod, "oauth">) {
    setSaving(method);
    setLocalMessage(null);
    onError?.("");

    const body =
      method === "mailbox_password"
        ? {
            method,
            email: mailbox.email,
            password: mailbox.password,
            providerHint: mailbox.providerHint,
            senderName: mailbox.senderName,
          }
        : method === "app_password"
        ? {
            method,
            email: appPassword.email,
            appPassword: appPassword.appPassword,
            providerHint: appPassword.providerHint,
            senderName: appPassword.senderName,
          }
        : {
            method,
            email: imapSmtp.email,
            username: imapSmtp.username,
            password: imapSmtp.password,
            providerHint: imapSmtp.providerHint,
            senderName: imapSmtp.senderName,
            imapHost: imapSmtp.imapHost,
            imapPort: imapSmtp.imapPort,
            imapSsl: imapSmtp.imapSsl,
            smtpHost: imapSmtp.smtpHost,
            smtpPort: imapSmtp.smtpPort,
            smtpSsl: imapSmtp.smtpSsl,
          };

    try {
      const response = await fetch("/api/email/connections", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const payload = (await response.json().catch(() => ({}))) as { error?: string; hint?: string };

      if (!response.ok) {
        const detail = [payload.error, payload.hint].filter(Boolean).join(" ");
        throw new Error(detail || "Unable to save this mailbox connection.");
      }

      const message = "Mailbox setup saved. Work Hat will use this connection method as the mailbox adapter comes online.";
      setLocalMessage({ type: "success", message });
      onNotice?.(message);
      await onSaved?.();
    } catch (error) {
      const message = error instanceof Error ? error.message : "Unable to save this mailbox connection.";
      setLocalMessage({ type: "error", message });
      onError?.(message);
    } finally {
      setSaving(null);
    }
  }

  return (
    <div className="space-y-4">
      <div className="grid gap-3 md:grid-cols-2">
        {METHODS.map((method) => (
          <button
            key={method.key}
            type="button"
            onClick={() => setSelected(method.key)}
            className={`rounded-[18px] border p-4 text-left transition-colors ${
              selected === method.key
                ? "border-[var(--moss)] bg-[rgba(144,50,61,0.06)]"
                : "border-[var(--line)] bg-[rgba(255,255,255,0.02)] hover:border-[var(--line-strong)]"
            }`}
          >
            <p className="eyebrow text-[8px] text-[var(--muted)]">{method.eyebrow}</p>
            <p className="mt-1 text-sm font-semibold text-[var(--foreground)]">{method.title}</p>
            <p className="mt-2 text-xs leading-5 text-[var(--muted)]">{method.body}</p>
          </button>
        ))}
      </div>

      <div className="rounded-[18px] border border-[var(--line)] bg-[var(--panel-strong)] p-4">
        {selected === "oauth" && (
          <div className="space-y-3">
            <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <p className="text-sm font-semibold">Connect with provider approval</p>
                <p className="mt-1 text-xs leading-5 text-[var(--muted)]">
                  Choose Gmail today. Microsoft 365 maps to this same OAuth/xOAuth path as the adapter is enabled.
                </p>
              </div>
              {canEdit ? (
                <Link
                  href={`/api/email/gmail/connect?returnTo=${encodeURIComponent(returnTo)}`}
                  className="w-fit rounded-full bg-[var(--moss)] px-4 py-2 text-xs font-medium text-white transition-opacity hover:opacity-90"
                >
                  Connect Gmail
                </Link>
              ) : (
                <span className="w-fit rounded-full border border-[var(--line)] px-4 py-2 text-xs text-[var(--muted)]">
                  Admin access required
                </span>
              )}
            </div>
            <div className="rounded-[14px] border border-[var(--line)] bg-[rgba(255,255,255,0.02)] px-4 py-3">
              <p className="text-xs font-medium">Outlook / Microsoft 365</p>
              <p className="mt-1 text-xs leading-5 text-[var(--muted)]">Uses the same connection type. Adapter support is staged behind the current Gmail path.</p>
            </div>
          </div>
        )}

        {selected === "mailbox_password" && (
          <form
            className="space-y-3"
            onSubmit={(event) => {
              event.preventDefault();
              void saveConnection("mailbox_password");
            }}
          >
            <div>
              <p className="text-sm font-semibold">Mailbox login and password</p>
              <p className="mt-1 text-xs leading-5 text-[var(--muted)]">Use only for providers that still allow direct mailbox authentication.</p>
            </div>
            <div className="grid gap-3 md:grid-cols-2">
              <TextField label="Mailbox email" type="email" value={mailbox.email} onChange={(email) => setMailbox((prev) => ({ ...prev, email }))} />
              <TextField label="Password" type="password" value={mailbox.password} onChange={(password) => setMailbox((prev) => ({ ...prev, password }))} />
              <TextField label="Provider autodetect hint" placeholder="Optional: Zoho, cPanel, company mail" value={mailbox.providerHint} onChange={(providerHint) => setMailbox((prev) => ({ ...prev, providerHint }))} />
              <TextField label="Sender name" placeholder="Work Hat Support" value={mailbox.senderName} onChange={(senderName) => setMailbox((prev) => ({ ...prev, senderName }))} />
            </div>
            <SubmitButton disabled={!canEdit || saving !== null}>{saving === "mailbox_password" ? "Saving..." : "Save mailbox login"}</SubmitButton>
          </form>
        )}

        {selected === "app_password" && (
          <form
            className="space-y-3"
            onSubmit={(event) => {
              event.preventDefault();
              void saveConnection("app_password");
            }}
          >
            <div>
              <p className="text-sm font-semibold">App password</p>
              <p className="mt-1 text-xs leading-5 text-[var(--muted)]">Create the app password in your mail provider, then paste it here. Do not use your normal account password.</p>
            </div>
            <div className="grid gap-3 md:grid-cols-2">
              <SelectField label="Provider" value={appPassword.providerHint} onChange={(providerHint) => setAppPassword((prev) => ({ ...prev, providerHint }))} />
              <TextField label="Mailbox email" type="email" value={appPassword.email} onChange={(email) => setAppPassword((prev) => ({ ...prev, email }))} />
              <TextField label="App password" type="password" value={appPassword.appPassword} onChange={(value) => setAppPassword((prev) => ({ ...prev, appPassword: value }))} />
              <TextField label="Sender name" placeholder="Work Hat Support" value={appPassword.senderName} onChange={(senderName) => setAppPassword((prev) => ({ ...prev, senderName }))} />
            </div>
            <SubmitButton disabled={!canEdit || saving !== null}>{saving === "app_password" ? "Saving..." : "Save app password"}</SubmitButton>
          </form>
        )}

        {selected === "imap_smtp" && (
          <form
            className="space-y-3"
            onSubmit={(event) => {
              event.preventDefault();
              void saveConnection("imap_smtp");
            }}
          >
            <div>
              <p className="text-sm font-semibold">IMAP / SMTP settings</p>
              <p className="mt-1 text-xs leading-5 text-[var(--muted)]">Use this for hosted email, corporate mail servers, cPanel, Zoho, or private servers.</p>
            </div>
            <div className="grid gap-3 md:grid-cols-2">
              <SelectField label="Provider" value={imapSmtp.providerHint} onChange={(providerHint) => setImapSmtp((prev) => ({ ...prev, providerHint }))} />
              <TextField label="Mailbox email" type="email" value={imapSmtp.email} onChange={(email) => setImapSmtp((prev) => ({ ...prev, email }))} />
              <TextField label="Username" value={imapSmtp.username} onChange={(username) => setImapSmtp((prev) => ({ ...prev, username }))} />
              <TextField label="Password" type="password" value={imapSmtp.password} onChange={(password) => setImapSmtp((prev) => ({ ...prev, password }))} />
              <TextField label="Sender name" placeholder="Work Hat Support" value={imapSmtp.senderName} onChange={(senderName) => setImapSmtp((prev) => ({ ...prev, senderName }))} />
              <TextField label="IMAP host" placeholder="imap.example.com" value={imapSmtp.imapHost} onChange={(imapHost) => setImapSmtp((prev) => ({ ...prev, imapHost }))} />
              <TextField label="IMAP port" type="number" value={imapSmtp.imapPort} onChange={(imapPort) => setImapSmtp((prev) => ({ ...prev, imapPort }))} />
              <TextField label="SMTP host" placeholder="smtp.example.com" value={imapSmtp.smtpHost} onChange={(smtpHost) => setImapSmtp((prev) => ({ ...prev, smtpHost }))} />
              <TextField label="SMTP port" type="number" value={imapSmtp.smtpPort} onChange={(smtpPort) => setImapSmtp((prev) => ({ ...prev, smtpPort }))} />
            </div>
            <div className="flex flex-wrap gap-3">
              <ToggleField label="Use SSL/TLS for IMAP" checked={imapSmtp.imapSsl} onChange={(imapSsl) => setImapSmtp((prev) => ({ ...prev, imapSsl }))} />
              <ToggleField label="Use SSL/TLS for SMTP" checked={imapSmtp.smtpSsl} onChange={(smtpSsl) => setImapSmtp((prev) => ({ ...prev, smtpSsl }))} />
            </div>
            <SubmitButton disabled={!canEdit || saving !== null}>{saving === "imap_smtp" ? "Saving..." : "Save IMAP / SMTP"}</SubmitButton>
          </form>
        )}

        {localMessage && (
          <div
            className={`mt-4 rounded-[14px] border px-4 py-3 text-xs leading-5 ${
              localMessage.type === "success"
                ? "border-emerald-400/20 bg-emerald-400/10 text-emerald-200"
                : "border-[rgba(144,50,61,0.4)] bg-[rgba(73,17,28,0.18)] text-[rgba(255,210,210,0.9)]"
            }`}
          >
            {localMessage.message}
          </div>
        )}
      </div>
    </div>
  );
}

function TextField({
  label,
  value,
  onChange,
  placeholder = "",
  type = "text",
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  type?: string;
}) {
  return (
    <label className="flex flex-col gap-1 text-xs font-medium text-[var(--muted)]">
      {label}
      <input
        type={type}
        value={value}
        placeholder={placeholder}
        onChange={(event) => onChange(event.target.value)}
        className="rounded-lg border border-[var(--line)] bg-[var(--background)] px-3 py-2 text-sm text-[var(--foreground)] outline-none focus:border-[var(--moss)]"
      />
    </label>
  );
}

function SelectField({ label, value, onChange }: { label: string; value: string; onChange: (value: string) => void }) {
  return (
    <label className="flex flex-col gap-1 text-xs font-medium text-[var(--muted)]">
      {label}
      <select
        value={value}
        onChange={(event) => onChange(event.target.value)}
        className="rounded-lg border border-[var(--line)] bg-[var(--background)] px-3 py-2 text-sm text-[var(--foreground)] outline-none focus:border-[var(--moss)]"
      >
        <option value="gmail">Gmail</option>
        <option value="microsoft365">Microsoft 365</option>
        <option value="outlook">Outlook.com</option>
        <option value="exchange">Exchange</option>
        <option value="icloud">iCloud Mail</option>
        <option value="zoho">Zoho Mail</option>
        <option value="custom">Other provider</option>
      </select>
    </label>
  );
}

function ToggleField({ label, checked, onChange }: { label: string; checked: boolean; onChange: (checked: boolean) => void }) {
  return (
    <label className="inline-flex items-center gap-2 rounded-full border border-[var(--line)] px-3 py-2 text-xs text-[var(--muted)]">
      <input
        type="checkbox"
        checked={checked}
        onChange={(event) => onChange(event.target.checked)}
        className="h-4 w-4 accent-[var(--moss)]"
      />
      {label}
    </label>
  );
}

function SubmitButton({ children, disabled }: { children: ReactNode; disabled: boolean }) {
  return (
    <button
      type="submit"
      disabled={disabled}
      className="rounded-full bg-[var(--moss)] px-4 py-2 text-xs font-medium text-white transition-opacity hover:opacity-90 disabled:opacity-45"
    >
      {children}
    </button>
  );
}
