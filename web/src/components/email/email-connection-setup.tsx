"use client";

import Link from "next/link";
import { type ReactNode, useEffect, useState } from "react";

type EmailConnectionMethod = "oauth" | "mailbox_password" | "app_password" | "imap_smtp";
type SetupAvailability = "available" | "unavailable";

type SetupMethodReadiness = {
  key: EmailConnectionMethod | "custom_inbound";
  status: SetupAvailability;
  userMessage: string;
  adminMessage?: string;
};

type SetupReadinessResponse = {
  loginEmail?: string | null;
  canViewSetupDetails?: boolean;
  readiness?: {
    methods: Record<EmailConnectionMethod | "custom_inbound", SetupMethodReadiness>;
    summary: {
      activeInboundAdapterAvailable: boolean;
      activeOutboundAdapterAvailable: boolean;
      nextAction: string;
    };
  };
};

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

const PROVIDER_LABELS: Record<string, string> = {
  gmail: "Gmail",
  microsoft365: "Microsoft 365",
  outlook: "Outlook.com",
  exchange: "Exchange",
  icloud: "iCloud Mail",
  zoho: "Zoho Mail",
  custom: "Other provider",
};

const PROVIDER_DEFAULTS: Record<string, {
  imapHost: string;
  imapPort: string;
  imapSsl: boolean;
  smtpHost: string;
  smtpPort: string;
  smtpSsl: boolean;
}> = {
  gmail: { imapHost: "imap.gmail.com", imapPort: "993", imapSsl: true, smtpHost: "smtp.gmail.com", smtpPort: "465", smtpSsl: true },
  microsoft365: { imapHost: "outlook.office365.com", imapPort: "993", imapSsl: true, smtpHost: "smtp.office365.com", smtpPort: "587", smtpSsl: false },
  outlook: { imapHost: "imap-mail.outlook.com", imapPort: "993", imapSsl: true, smtpHost: "smtp-mail.outlook.com", smtpPort: "587", smtpSsl: false },
  icloud: { imapHost: "imap.mail.me.com", imapPort: "993", imapSsl: true, smtpHost: "smtp.mail.me.com", smtpPort: "587", smtpSsl: false },
  zoho: { imapHost: "imap.zoho.com", imapPort: "993", imapSsl: true, smtpHost: "smtp.zoho.com", smtpPort: "465", smtpSsl: true },
};

const APP_PASSWORD_PROVIDERS = new Set(["gmail", "microsoft365", "outlook", "icloud"]);
const DIRECT_PASSWORD_PROVIDERS = new Set(["zoho"]);

function providerLabel(provider: string) {
  return PROVIDER_LABELS[provider] ?? provider;
}

function methodGuidance(provider: string, method: EmailConnectionMethod) {
  if (method === "mailbox_password") {
    if (APP_PASSWORD_PROVIDERS.has(provider)) {
      return `${providerLabel(provider)} does not accept normal mailbox passwords here. Use OAuth when available or choose App password.`;
    }
    if (!DIRECT_PASSWORD_PROVIDERS.has(provider)) {
      return "This provider needs IMAP and SMTP settings. Choose IMAP / SMTP instead.";
    }
  }

  if (method === "app_password" && !PROVIDER_DEFAULTS[provider]) {
    return "This provider needs IMAP and SMTP host settings. Choose IMAP / SMTP instead.";
  }

  return null;
}

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
  return { email: "", password: "", providerHint: "zoho", senderName: "" };
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
  const [oauthStarting, setOauthStarting] = useState(false);
  const [localMessage, setLocalMessage] = useState<{ type: "success" | "error"; message: string } | null>(null);
  const [readiness, setReadiness] = useState<SetupReadinessResponse | null>(null);
  const [readinessLoading, setReadinessLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    async function loadReadiness() {
      try {
        const response = await fetch("/api/email/setup/readiness");
        const payload = (await response.json().catch(() => ({}))) as SetupReadinessResponse;
        if (!cancelled && response.ok) setReadiness(payload);
      } finally {
        if (!cancelled) setReadinessLoading(false);
      }
    }
    void loadReadiness();
    return () => {
      cancelled = true;
    };
  }, []);

  function methodReadiness(method: EmailConnectionMethod) {
    return readiness?.readiness?.methods?.[method] ?? {
      key: method,
      status: "unavailable" as const,
      userMessage: readinessLoading ? "Checking availability..." : "This connection method is not available yet.",
    };
  }

  function isMethodAvailable(method: EmailConnectionMethod) {
    return methodReadiness(method).status === "available";
  }

  async function saveConnection(method: Exclude<EmailConnectionMethod, "oauth">) {
    if (!isMethodAvailable(method)) {
      const status = methodReadiness(method);
      setLocalMessage({ type: "error", message: status.adminMessage ?? status.userMessage });
      onError?.(status.adminMessage ?? status.userMessage);
      return;
    }

    setSaving(method);
    setLocalMessage(null);
    onError?.("");

    const guidance =
      method === "mailbox_password"
        ? methodGuidance(mailbox.providerHint, method)
        : method === "app_password"
        ? methodGuidance(appPassword.providerHint, method)
        : null;
    if (guidance) {
      setSaving(null);
      setLocalMessage({ type: "error", message: guidance });
      onError?.(guidance);
      return;
    }

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
      const payload = (await response.json().catch(() => ({}))) as { error?: string; hint?: string; connection?: unknown };

      if (!response.ok) {
        if (payload.connection) {
          await onSaved?.();
        }
        const detail = [payload.error, payload.hint].filter(Boolean).join(" ");
        throw new Error(detail || "Unable to save this mailbox connection.");
      }

      const message = "Mailbox validated and activated. Work Hat can now use this connection for inbound polling and approved replies.";
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
      <div className="rounded-[18px] border border-[var(--line)] bg-[rgba(255,255,255,0.02)] p-4">
        <p className="eyebrow text-[8px] text-[var(--muted)]">Account separation</p>
        <p className="mt-1 text-sm font-semibold">Your Work Hat login is separate from the managed mailbox</p>
        <p className="mt-2 text-xs leading-5 text-[var(--muted)]">
          {readiness?.loginEmail ? `${readiness.loginEmail} is your Work Hat user account. ` : ""}
          Connect the support mailbox your team wants Work Hat to read and reply from. It can be a different email address.
        </p>
      </div>

      <div className="grid gap-3 md:grid-cols-2">
        {METHODS.map((method) => (
          (() => {
            const status = methodReadiness(method.key);
            const available = status.status === "available";
            return (
          <button
            key={method.key}
            type="button"
            disabled={!available && selected !== method.key}
            onClick={() => setSelected(method.key)}
            className={`rounded-[18px] border p-4 text-left transition-colors ${
              selected === method.key
                ? "border-[var(--moss)] bg-[rgba(144,50,61,0.06)]"
                : "border-[var(--line)] bg-[rgba(255,255,255,0.02)] hover:border-[var(--line-strong)]"
            }`}
          >
            <div className="flex items-start justify-between gap-3">
              <p className="eyebrow text-[8px] text-[var(--muted)]">{method.eyebrow}</p>
              <span className={`rounded-full px-2 py-0.5 text-[9px] font-medium ${
                available ? "bg-emerald-400/10 text-emerald-300" : "bg-[rgba(144,50,61,0.14)] text-[rgba(255,190,190,0.9)]"
              }`}>
                {readinessLoading ? "Checking" : available ? "Available" : "Unavailable"}
              </span>
            </div>
            <p className="mt-1 text-sm font-semibold text-[var(--foreground)]">{method.title}</p>
            <p className="mt-2 text-xs leading-5 text-[var(--muted)]">{method.body}</p>
            {!available && (
              <p className="mt-2 text-xs leading-5 text-[rgba(255,190,190,0.9)]">
                {status.adminMessage ?? status.userMessage}
              </p>
            )}
          </button>
            );
          })()
        ))}
      </div>

      <div className="rounded-[18px] border border-[var(--line)] bg-[var(--panel-strong)] p-4">
        {selected === "oauth" && (
          <div className="space-y-3">
            <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <p className="text-sm font-semibold">Connect with provider approval</p>
                <p className="mt-1 text-xs leading-5 text-[var(--muted)]">
                  Choose Gmail today. Microsoft 365 maps to this same OAuth/xOAuth path when Microsoft OAuth is enabled.
                </p>
              </div>
              {canEdit ? (
                isMethodAvailable("oauth") ? (
                  <Link
                    href={`/api/email/gmail/connect?returnTo=${encodeURIComponent(returnTo)}`}
                    onClick={() => setOauthStarting(true)}
                    className="w-fit rounded-full bg-[var(--moss)] px-4 py-2 text-xs font-medium text-white transition-opacity hover:opacity-90"
                  >
                    {oauthStarting ? "Opening Google..." : "Connect Gmail"}
                  </Link>
                ) : (
                  <span className="w-fit rounded-full border border-[rgba(144,50,61,0.35)] px-4 py-2 text-xs text-[rgba(255,190,190,0.9)]">
                    Gmail unavailable
                  </span>
                )
              ) : (
                <span className="w-fit rounded-full border border-[var(--line)] px-4 py-2 text-xs text-[var(--muted)]">
                  Admin access required
                </span>
              )}
            </div>
            <div className="rounded-[14px] border border-[var(--line)] bg-[rgba(255,255,255,0.02)] px-4 py-3">
              <p className="text-xs font-medium">Outlook / Microsoft 365</p>
              <p className="mt-1 text-xs leading-5 text-[var(--muted)]">Microsoft OAuth is not enabled yet. Use app password or IMAP/SMTP for Microsoft mailboxes when those methods are available.</p>
            </div>
            {!isMethodAvailable("oauth") && (
              <div className="rounded-[14px] border border-[rgba(144,50,61,0.35)] bg-[rgba(73,17,28,0.18)] px-4 py-3 text-xs leading-5 text-[rgba(255,210,210,0.9)]">
                {methodReadiness("oauth").adminMessage ?? methodReadiness("oauth").userMessage}
              </div>
            )}
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
              <SelectField label="Provider" value={mailbox.providerHint} onChange={(providerHint) => setMailbox((prev) => ({ ...prev, providerHint }))} />
              <TextField label="Sender name" placeholder="Work Hat Support" value={mailbox.senderName} onChange={(senderName) => setMailbox((prev) => ({ ...prev, senderName }))} />
            </div>
            {methodGuidance(mailbox.providerHint, "mailbox_password") && (
              <InlineGuidance>{methodGuidance(mailbox.providerHint, "mailbox_password")}</InlineGuidance>
            )}
            <SubmitButton disabled={!canEdit || saving !== null || !isMethodAvailable("mailbox_password")}>{saving === "mailbox_password" ? "Saving..." : "Save mailbox login"}</SubmitButton>
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
            {appPassword.providerHint === "gmail" && (
              <InlineGuidance>For Gmail, paste a Google app password from Google Account, Security, 2-Step Verification, App passwords. Your normal Gmail password will be rejected.</InlineGuidance>
            )}
            {methodGuidance(appPassword.providerHint, "app_password") && (
              <InlineGuidance>{methodGuidance(appPassword.providerHint, "app_password")}</InlineGuidance>
            )}
            <SubmitButton disabled={!canEdit || saving !== null || !isMethodAvailable("app_password")}>{saving === "app_password" ? "Saving..." : "Save app password"}</SubmitButton>
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
              <SelectField
                label="Provider"
                value={imapSmtp.providerHint}
                onChange={(providerHint) => setImapSmtp((prev) => ({
                  ...prev,
                  providerHint,
                  ...(PROVIDER_DEFAULTS[providerHint] ?? {}),
                }))}
              />
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
            {imapSmtp.providerHint === "gmail" && (
              <InlineGuidance>Gmail IMAP requires IMAP access enabled in Gmail settings and an app password when 2-Step Verification is on. A normal Google password will fail.</InlineGuidance>
            )}
            <SubmitButton disabled={!canEdit || saving !== null || !isMethodAvailable("imap_smtp")}>{saving === "imap_smtp" ? "Saving..." : "Save IMAP / SMTP"}</SubmitButton>
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
        {Object.entries(PROVIDER_LABELS).map(([provider, labelText]) => (
          <option key={provider} value={provider}>{labelText}</option>
        ))}
      </select>
    </label>
  );
}

function InlineGuidance({ children }: { children: ReactNode }) {
  return (
    <div className="rounded-[14px] border border-[rgba(255,255,255,0.12)] bg-[rgba(255,255,255,0.04)] px-4 py-3 text-xs leading-5 text-[var(--muted)]">
      {children}
    </div>
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
