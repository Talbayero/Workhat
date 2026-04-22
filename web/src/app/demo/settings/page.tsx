import { SettingsShell } from "@/components/settings/settings-shell";

const mockOrg = {
  id: "org-demo",
  name: "Demo Workspace",
  slug: "demo",
  crm_plan: "enterprise",
  ai_plan: "pro",
};

const mockChannel = {
  supportEmail: "support@example.com",
  fromName: "Work Hat Support",
  timezone: "America/New_York",
  inboundAddress: "forward@workhat.ai",
};

const mockTeam = [
  { id: "1", full_name: "Marcos", email: "marcos@example.com", role: "admin", status: "active" },
  { id: "2", full_name: "Anika", email: "anika@example.com", role: "manager", status: "active" },
];

const mockSlaPolicy = {
  enabled: true,
  first_response_minutes: 60,
  next_response_minutes: 240,
  at_risk_threshold_minutes: 15,
  business_hours_json: { mode: "calendar" },
};

export default async function DemoSettingsPage() {
  return (
    <SettingsShell
      org={mockOrg}
      channel={mockChannel}
      slaPolicy={mockSlaPolicy}
      team={mockTeam}
      callerRole="admin"
      callerId="1"
      isDemo={true}
      baseDir="/demo"
    />
  );
}
