import { NextResponse } from "next/server";
import { getCurrentAppUser } from "@/lib/auth/app-user";
import { requireCapability } from "@/lib/auth/capabilities";
import { getEmailSetupReadiness } from "@/lib/email/setup-readiness";
import { createClient } from "@/lib/supabase/server";

type UserScopedReadCheck = {
  ok: boolean;
  message: string;
  count?: number;
};

async function collectUserScopedReadDiagnostics(orgId: string) {
  const supabase = await createClient();
  const toCheck = (
    result: { error: { message: string } | null; count: number | null },
    successMessage: string
  ): UserScopedReadCheck =>
    result.error
      ? { ok: false, message: result.error.message }
      : { ok: true, message: successMessage, count: result.count ?? 0 };

  const [
    users,
    organizations,
    channels,
    companies,
    contacts,
    conversations,
    messages,
    knowledgeEntries,
    qaFollowUps,
    emailConnectionMetadata,
  ] = await Promise.all([
    supabase.from("users").select("id", { count: "exact", head: true }).eq("org_id", orgId),
    supabase.from("organizations").select("id", { count: "exact", head: true }).eq("id", orgId),
    supabase.from("channels").select("id", { count: "exact", head: true }).eq("org_id", orgId),
    supabase.from("companies").select("id", { count: "exact", head: true }).eq("org_id", orgId),
    supabase.from("contacts").select("id", { count: "exact", head: true }).eq("org_id", orgId),
    supabase.from("conversations").select("id", { count: "exact", head: true }).eq("org_id", orgId),
    supabase.from("messages").select("id", { count: "exact", head: true }).eq("org_id", orgId),
    supabase.from("knowledge_entries").select("id", { count: "exact", head: true }).eq("org_id", orgId),
    supabase.from("qa_follow_ups").select("id", { count: "exact", head: true }).eq("org_id", orgId),
    supabase
      .from("email_connections")
      .select("id, org_id, provider, provider_account_email, status, sync_status", { count: "exact", head: true })
      .eq("org_id", orgId),
  ]);

  return {
    tables: {
      users: toCheck(users, "User-scoped reads can access org users."),
      organizations: toCheck(organizations, "User-scoped reads can access the organization."),
      channels: toCheck(channels, "User-scoped reads can access channel metadata."),
      companies: toCheck(companies, "User-scoped reads can access companies."),
      contacts: toCheck(contacts, "User-scoped reads can access contacts."),
      conversations: toCheck(conversations, "User-scoped reads can access conversations."),
      messages: toCheck(messages, "User-scoped reads can access messages."),
      knowledgeEntries: toCheck(knowledgeEntries, "User-scoped reads can access knowledge entries."),
      qaFollowUps: toCheck(qaFollowUps, "User-scoped reads can access QA follow-ups."),
      emailConnectionMetadata: toCheck(emailConnectionMetadata, "User-scoped reads can access non-secret email connection metadata."),
    },
  };
}

export async function GET() {
  const appUser = await getCurrentAppUser({ label: "system/setup-health" });
  if (!appUser) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const denied = await requireCapability(appUser, "settings.manage", "system/setup-health");
  if (denied) return denied;

  const readiness = getEmailSetupReadiness();
  const userScopedReadDiagnostics = await collectUserScopedReadDiagnostics(appUser.org_id).catch((error) => ({
    error: error instanceof Error ? error.message : "Unable to run user-scoped read diagnostics.",
    tables: {},
  }));

  return NextResponse.json({
    ...readiness,
    userScopedReadDiagnostics,
  });
}

