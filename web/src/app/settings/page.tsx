import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { SettingsShell } from "@/components/settings/settings-shell";

export default async function SettingsPage() {
  const supabase = await createClient();

  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login?next=/settings");

  // Look up the app user row
  const { data: appUser } = await supabase
    .from("users")
    .select("id, org_id, role")
    .eq("auth_user_id", user.id)
    .single();

  // No app user = onboarding was never completed
  if (!appUser) redirect("/onboarding");

  const { id: callerId, org_id: orgId, role: callerRole } =
    appUser as { id: string; org_id: string; role: string };

  // Fetch org
  const { data: org } = await supabase
    .from("organizations")
    .select("id, name, slug, crm_plan, ai_plan")
    .eq("id", orgId)
    .single();

  if (!org) redirect("/onboarding");

  // Fetch channel — read inbound_address from direct column + config_json
  const { data: channel } = await supabase
    .from("channels")
    .select("id, inbound_address, config_json")
    .eq("org_id", orgId)
    .eq("type", "email")
    .single();

  const config =
    (channel as { id: string; inbound_address: string | null; config_json: Record<string, string> } | null)
      ?.config_json ?? {};

  const channelData = channel
    ? {
        supportEmail: config.support_email ?? "",
        fromName: config.from_name ?? "",
        timezone: config.timezone ?? "America/New_York",
        // Prefer direct column, fall back to config_json value
        inboundAddress:
          (channel as { inbound_address: string | null }).inbound_address ??
          config.inbound_address ??
          "",
      }
    : null;

  // Fetch team
  const { data: members } = await supabase
    .from("users")
    .select("id, full_name, email, role, status, created_at")
    .eq("org_id", orgId)
    .order("created_at", { ascending: true });

  return (
    <SettingsShell
      org={org as { id: string; name: string; slug: string; crm_plan: string; ai_plan: string }}
      channel={channelData}
      team={(members ?? []) as { id: string; full_name: string; email: string; role: string; status: string }[]}
      callerRole={callerRole}
      callerId={callerId}
    />
  );
}
