import { readFileSync } from "node:fs";
import { join } from "node:path";

import { shouldShowManualConversationControl } from "@/lib/inbox/manual-conversation";

function source(...segments: string[]) {
  return readFileSync(join(process.cwd(), ...segments), "utf8");
}

describe("P0 MVP hardening guardrails", () => {
  it("hides manual conversation creation for normal production users", () => {
    expect(shouldShowManualConversationControl({
      isDemo: false,
      callerRole: "agent",
      nodeEnv: "production",
    })).toBe(false);

    expect(shouldShowManualConversationControl({
      isDemo: true,
      callerRole: "agent",
      nodeEnv: "production",
    })).toBe(true);
    expect(shouldShowManualConversationControl({
      isDemo: false,
      callerRole: "admin",
      nodeEnv: "production",
    })).toBe(true);
    expect(shouldShowManualConversationControl({
      isDemo: false,
      callerRole: "agent",
      nodeEnv: "development",
    })).toBe(true);
  });

  it("guards inbox manual conversation UI behind explicit visibility state", () => {
    const layout = source("src/components/inbox/inbox-layout-client.tsx");

    expect(layout).toContain("canCreateManualConversation");
    expect(layout).not.toContain("Simulate an inbound message");
    expect(layout).not.toContain("create one to test");
  });

  it("does not render the unimplemented delete organization action", () => {
    const settings = source("src/components/settings/settings-shell.tsx");

    expect(settings).not.toContain("Delete org");
    expect(settings).not.toContain("Delete organization");
  });

  it("exposes only real persisted AI settings", () => {
    const settings = source("src/components/settings/settings-shell.tsx");

    expect(settings).toContain('{ id: "ai", label: "AI drafting" }');
    expect(settings).toContain("/api/settings/ai");
    expect(settings).toContain("/api/settings/ai/test");
    expect(settings).not.toContain("function AiTab");
    expect(settings).not.toContain("Generate drafts automatically");
  });

  it("keeps Billing read-only while the billing portal is unavailable", () => {
    const settings = source("src/components/settings/settings-shell.tsx");

    expect(settings).toContain("Billing portal access is not configured yet");
    expect(settings).toContain("Portal unavailable");
    expect(settings).not.toContain("/api/stripe/checkout");
  });

  it("keeps Gmail live-watch repair out of onboarding", () => {
    const onboarding = source("src/app/onboarding/page.tsx");

    expect(onboarding).not.toContain("Repair Gmail live updates");
    expect(onboarding).not.toContain("/api/email/gmail/watch");
    expect(onboarding).not.toContain("enableGmailWatch");
  });

  it("fails Settings role bootstrap closed when app-user lookup fails", () => {
    const settingsPage = source("src/app/settings/page.tsx");

    expect(settingsPage).toContain('let callerRole = "agent";');
    expect(settingsPage).not.toContain('let callerRole = "admin";');
  });

  it("does not create legacy non-Gmail channel records during workspace bootstrap", () => {
    const orgCreateRoute = source("src/app/api/org/create/route.ts");
    const bootstrapRepair = source("../supabase/production-onboarding-repair.sql");
    const bootstrapMigration = source("../supabase/migrations/0048_remove_legacy_channel_bootstrap.sql");

    expect(orgCreateRoute).not.toContain('provider: "postmark"');
    expect(orgCreateRoute).not.toContain('.from("channels").insert');
    expect(bootstrapRepair).not.toContain("'postmark'");
    expect(bootstrapMigration).not.toContain("'postmark'");
  });
});
