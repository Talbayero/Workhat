"use client";

import Link from "next/link";
import { useEffect, useState } from "react";

type SetupAvailability = "ready" | "not_configured";
type SetupCheckStatus = "pass" | "warn" | "fail";

type SetupMethodReadiness = {
  key: "oauth";
  status: SetupAvailability;
  userMessage: string;
  adminMessage?: string;
};

type SetupReadinessResponse = {
  loginEmail?: string | null;
  canViewSetupDetails?: boolean;
  readiness?: {
    checks: Array<{
      key: string;
      label: string;
      status: SetupCheckStatus;
      message: string;
    }>;
    methods: Record<"oauth", SetupMethodReadiness>;
    summary: {
      googleOAuthConfigured: boolean;
      googleRedirectUri: string | null;
      gmailApiEnabledExpectation?: string;
      missingRequiredEnv: string[];
      nextAction: string;
    };
  };
};

type EmailConnectionSetupProps = {
  canEdit?: boolean;
  returnTo: string;
  onNotice?: (message: string) => void;
  onError?: (message: string) => void;
};

function statusClass(status: SetupCheckStatus) {
  if (status === "pass") return "border-emerald-400/20 bg-emerald-400/10 text-emerald-200";
  if (status === "warn") return "border-amber-400/20 bg-amber-400/10 text-amber-200";
  return "border-[rgba(144,50,61,0.4)] bg-[rgba(73,17,28,0.18)] text-[rgba(255,210,210,0.9)]";
}

export function EmailConnectionSetup({
  canEdit = true,
  returnTo,
  onNotice,
  onError,
}: EmailConnectionSetupProps) {
  const [readiness, setReadiness] = useState<SetupReadinessResponse | null>(null);
  const [readinessLoading, setReadinessLoading] = useState(true);
  const [oauthStarting, setOauthStarting] = useState(false);

  useEffect(() => {
    let cancelled = false;

    async function loadReadiness() {
      try {
        const response = await fetch("/api/email/setup/readiness");
        const payload = (await response.json().catch(() => ({}))) as SetupReadinessResponse;
        if (!cancelled && response.ok) setReadiness(payload);
      } catch {
        if (!cancelled) onError?.("Unable to check Gmail setup readiness.");
      } finally {
        if (!cancelled) setReadinessLoading(false);
      }
    }

    void loadReadiness();
    return () => {
      cancelled = true;
    };
  }, [onError]);

  const oauth = readiness?.readiness?.methods.oauth;
  const oauthReady = oauth?.status === "ready";

  return (
    <div className="space-y-4">
      <div className="rounded-[18px] border border-[var(--line)] bg-[rgba(255,255,255,0.02)] p-4">
        <p className="eyebrow text-[8px] text-[var(--muted)]">Account separation</p>
        <p className="mt-1 text-sm font-semibold">Your Work Hat login is separate from the Gmail mailbox</p>
        <p className="mt-2 text-xs leading-5 text-[var(--muted)]">
          {readiness?.loginEmail ? `${readiness.loginEmail} is your Work Hat user account. ` : ""}
          Connect the Google Workspace mailbox Work Hat should read and reply from. For the MVP, Gmail OAuth is the only supported email setup path.
        </p>
      </div>

      {readinessLoading && (
        <div className="rounded-[18px] border border-[var(--line)] bg-[rgba(255,255,255,0.02)] p-4 text-xs text-[var(--muted)]">
          Checking Gmail OAuth readiness...
        </div>
      )}

      {!readinessLoading && (
        <div className="rounded-[18px] border border-[var(--line)] bg-[var(--panel-strong)] p-4">
          <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <p className="eyebrow text-[8px] text-[var(--muted)]">Supported MVP path</p>
              <p className="mt-1 text-base font-semibold">Connect Gmail with OAuth</p>
              <p className="mt-2 max-w-xl text-xs leading-5 text-[var(--muted)]">
                Gmail OAuth imports recent mail, creates conversations, and sends approved replies through the connected mailbox.
              </p>
            </div>

            {oauthReady && canEdit ? (
              <Link
                href={`/api/oauth/google/start?returnTo=${encodeURIComponent(returnTo)}`}
                onClick={() => {
                  setOauthStarting(true);
                  onNotice?.("Opening Google sign-in...");
                }}
                className="w-fit rounded-full bg-[var(--moss)] px-4 py-2 text-xs font-medium text-white transition-opacity hover:opacity-90"
              >
                {oauthStarting ? "Opening Google..." : "Connect Gmail"}
              </Link>
            ) : (
              <button
                type="button"
                disabled
                className="w-fit rounded-full border border-[rgba(144,50,61,0.45)] px-4 py-2 text-xs text-[rgba(255,210,210,0.9)] opacity-80"
              >
                Connect Gmail
              </button>
            )}
          </div>

          {!oauthReady && (
            <div className="mt-4 rounded-[14px] border border-[rgba(144,50,61,0.4)] bg-[rgba(73,17,28,0.18)] px-4 py-3 text-xs leading-5 text-[rgba(255,210,210,0.9)]">
              Admin setup required: Gmail OAuth is not configured
            </div>
          )}

          {readiness?.canViewSetupDetails && readiness.readiness && (
            <div className="mt-4 space-y-3">
              <p className="eyebrow text-[8px] text-[var(--muted)]">Admin setup health</p>
              <div className="grid gap-2 md:grid-cols-2">
                {readiness.readiness.checks.map((check) => (
                  <div key={check.key} className={`rounded-[14px] border px-4 py-3 text-xs leading-5 ${statusClass(check.status)}`}>
                    <div className="flex items-start justify-between gap-3">
                      <p className="font-medium">{check.label}</p>
                      <span className="uppercase">{check.status}</span>
                    </div>
                    <p className="mt-1 opacity-90">{check.message}</p>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
