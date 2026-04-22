import type { Metadata } from "next";
import Link from "next/link";
import { getCurrentAppUser } from "@/lib/auth/app-user";
import { hasCapability } from "@/lib/auth/capabilities";
import { getAuditTrail, parseAuditTrailFilters } from "@/lib/audit/audit-trail";
import { AuditTrailShell } from "@/components/audit/audit-trail-shell";

export const metadata: Metadata = { title: "Audit Trail - Work Hat" };

type AuditPageProps = {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
};

function ForbiddenAuditState() {
  return (
    <div className="flex h-full items-center justify-center px-6">
      <div className="max-w-lg rounded-[28px] border border-[var(--line)] bg-[var(--panel-strong)] p-8 text-center">
        <p className="eyebrow text-[10px] text-[var(--muted)]">Audit trail</p>
        <h1 className="mt-3 text-2xl font-semibold">You do not have access to this monitor.</h1>
        <p className="mt-3 text-sm leading-6 text-[var(--muted)]">
          Audit logs are available to users with the `audit.read` capability. Ask an admin to adjust your role or capability overrides.
        </p>
        <Link href="/dashboard" className="mt-5 inline-flex rounded-full bg-[var(--moss)] px-5 py-2.5 text-sm font-medium text-white">
          Back to dashboard
        </Link>
      </div>
    </div>
  );
}

function AuditErrorState({ message }: { message: string }) {
  return (
    <div className="flex h-full items-center justify-center px-6">
      <div className="max-w-lg rounded-[28px] border border-[rgba(201,96,106,0.38)] bg-[rgba(73,17,28,0.18)] p-8 text-center">
        <p className="eyebrow text-[10px] text-[#f0a3a9]">Audit trail unavailable</p>
        <h1 className="mt-3 text-2xl font-semibold">Unable to load audit events.</h1>
        <p className="mt-3 text-sm leading-6 text-[var(--muted)]">{message}</p>
        <Link href="/audit" className="mt-5 inline-flex rounded-full bg-[var(--moss)] px-5 py-2.5 text-sm font-medium text-white">
          Try again
        </Link>
      </div>
    </div>
  );
}

function firstValue(value: string | string[] | undefined) {
  return Array.isArray(value) ? value[0] : value;
}

export default async function AuditPage({ searchParams }: AuditPageProps) {
  const appUser = await getCurrentAppUser({ label: "audit-page", select: "id, org_id, role" });
  if (!appUser) return <ForbiddenAuditState />;

  const canReadAudit = await hasCapability(appUser, "audit.read", "audit-page");
  if (!canReadAudit) return <ForbiddenAuditState />;

  const params = await searchParams;
  const filters = parseAuditTrailFilters({
    actor: firstValue(params.actor),
    action: firstValue(params.action),
    entityType: firstValue(params.entityType),
    entityId: firstValue(params.entityId),
    from: firstValue(params.from),
    to: firstValue(params.to),
    orgId: firstValue(params.orgId),
    page: firstValue(params.page),
    pageSize: firstValue(params.pageSize),
  });

  let result;
  try {
    result = await getAuditTrail(appUser, filters);
  } catch (error) {
    return (
      <AuditErrorState
        message={error instanceof Error ? error.message : "The audit query failed unexpectedly."}
      />
    );
  }

  return <AuditTrailShell result={result} />;
}
