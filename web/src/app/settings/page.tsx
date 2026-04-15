import { createClient } from "@/lib/supabase/server";
import { SettingsShell } from "@/components/settings/settings-shell";

export default async function SettingsPage() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();

  let orgData = null;
  let channelData = null;
  let teamData: unknown[] = [];
  let callerRole = "admin";
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
        .single();

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
      team={teamData as { id: string; full_name: string; email: string; role: string; status: string }[]}
      callerRole={callerRole}
      callerId={callerId}
    />
  );
}
