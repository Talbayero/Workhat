import type { Metadata } from "next";
import { createClient } from "@/lib/supabase/server";
import { SettingsShell } from "@/components/settings/settings-shell";

export const metadata: Metadata = { title: "Settings — Work Hat" };

type SettingsPageProps = {
  searchParams: Promise<{ tab?: string }>;
};

export default async function SettingsPage({ searchParams }: SettingsPageProps) {
  const { tab } = await searchParams;
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();

  let orgData = null;
  let channelData = null;
  let slaPolicy = null;
  let teamData: unknown[] = [];
  let mailboxReady = false;
  let knowledgeEntryCount = 0;
  let callerRole = "agent";
  let callerId = "";

  if (user) {
    const { data: appUser } = await supabase
      .from("users")
      .select("id, org_id, role")
      .eq("auth_user_id", user.id)
      .single();

    if (appUser) {
      const { id, org_id: orgId, role } =
        appUser as { id: string; org_id: string; role: string };
      callerRole = role;
      callerId = id;

      const { data: org } = await supabase
        .from("organizations")
        .select("id, name, slug, crm_plan, ai_plan")
        .eq("id", orgId)
        .single();
      orgData = org;

      const { data: channel } = await supabase
        .from("channels")
        .select("id, inbound_address, config_json")
        .eq("org_id", orgId)
        .eq("type", "email")
        .order("created_at", { ascending: true })
        .limit(1)
        .maybeSingle();

      const cfg =
        (channel as { inbound_address: string | null; config_json: Record<string, string> } | null)
          ?.config_json ?? {};

      channelData = channel
        ? {
            supportEmail: cfg.support_email ?? "",
            fromName: cfg.from_name ?? "",
            timezone: cfg.timezone ?? "America/New_York",
            inboundAddress:
              (channel as { inbound_address: string | null }).inbound_address ??
              cfg.inbound_address ?? "",
          }
        : null;

      const { data: activeMailbox } = await supabase
        .from("email_connections")
        .select("id")
        .eq("org_id", orgId)
        .eq("inbound_enabled", true)
        .in("status", ["active", "connected"])
        .limit(1)
        .maybeSingle();
      mailboxReady = Boolean(activeMailbox);

      const { count: activeKnowledgeCount } = await supabase
        .from("knowledge_entries")
        .select("id", { count: "exact", head: true })
        .eq("org_id", orgId)
        .eq("is_active", true);
      knowledgeEntryCount = activeKnowledgeCount ?? 0;

      const { data: policy } = await supabase
        .from("org_sla_policies")
        .select("enabled, first_response_minutes, next_response_minutes, at_risk_threshold_minutes, business_hours_json")
        .eq("org_id", orgId)
        .maybeSingle();
      slaPolicy = policy;

      const { data: members } = await supabase
        .from("users")
        .select("id, full_name, email, role, status, created_at")
        .eq("org_id", orgId)
        .order("created_at", { ascending: true });
      teamData = members ?? [];
    }
  }

  return (
    <SettingsShell
      org={orgData as { id: string; name: string; slug: string; crm_plan: string; ai_plan: string } | null}
      channel={channelData}
      slaPolicy={slaPolicy as { enabled: boolean; first_response_minutes: number; next_response_minutes: number; at_risk_threshold_minutes: number; business_hours_json: Record<string, unknown> } | null}
      team={teamData as { id: string; full_name: string; email: string; role: string; status: string }[]}
      callerRole={callerRole}
      callerId={callerId}
      initialTab={tab}
      mailboxReady={mailboxReady}
      knowledgeEntryCount={knowledgeEntryCount}
    />
  );
}
