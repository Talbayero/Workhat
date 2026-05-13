import type { Metadata } from "next";
import Link from "next/link";
import { DashboardShell } from "@/components/dashboard/dashboard-shell";
import { getCurrentAppUser } from "@/lib/auth/app-user";
import { hasCapability } from "@/lib/auth/capabilities";

export const metadata: Metadata = { title: "Dashboard — Work Hat" };
import {
  getDashboardStats,
  getRecentEditLog,
  getQAQueueFromDB,
  getKnowledgeHealth,
  getIntentStats,
  getAiImprovementInsights,
} from "@/lib/analytics";

function ForbiddenDashboardState() {
  return (
    <div className="flex h-full items-center justify-center px-6">
      <div className="max-w-lg rounded-[28px] border border-[var(--line)] bg-[var(--panel-strong)] p-8 text-center">
        <p className="eyebrow text-[10px] text-[var(--muted)]">Dashboard</p>
        <h1 className="mt-3 text-2xl font-semibold">You do not have access to this dashboard.</h1>
        <p className="mt-3 text-sm leading-6 text-[var(--muted)]">
          Dashboard analytics are available to users with the `analytics.read` capability. Ask an admin to adjust your role or capability overrides.
        </p>
        <Link href="/inbox" className="mt-5 inline-flex rounded-full bg-[var(--moss)] px-5 py-2.5 text-sm font-medium text-white">
          Back to inbox
        </Link>
      </div>
    </div>
  );
}

/*
  Dashboard stays server-rendered for data loading, then hands the UI to the
  shared shell used by the demo so both surfaces evolve together.
*/
export default async function DashboardPage() {
  const appUser = await getCurrentAppUser({ label: "dashboard-page", select: "id, org_id, role" });
  if (!appUser) return <ForbiddenDashboardState />;

  const canReadAnalytics = await hasCapability(appUser, "analytics.read", "dashboard-page");
  if (!canReadAnalytics) return <ForbiddenDashboardState />;

  const [stats, log, qaQueue, knowledgeHealth, intentStats, aiImprovement] = await Promise.all([
    getDashboardStats(),
    getRecentEditLog(8),
    getQAQueueFromDB(),
    getKnowledgeHealth(),
    getIntentStats(),
    getAiImprovementInsights(),
  ]);

  return (
    <DashboardShell
      stats={stats}
      log={log}
      qaQueue={qaQueue}
      knowledgeHealth={knowledgeHealth}
      intentStats={intentStats}
      aiImprovement={aiImprovement}
    />
  );
}
