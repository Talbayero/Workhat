import type { Metadata } from "next";
import { DashboardShell } from "@/components/dashboard/dashboard-shell";

export const metadata: Metadata = { title: "Dashboard — Work Hat" };
import {
  getDashboardStats,
  getRecentEditLog,
  getQAQueueFromDB,
  getKnowledgeHealth,
  getIntentStats,
  getAiImprovementInsights,
} from "@/lib/supabase/queries";

/*
  Dashboard stays server-rendered for data loading, then hands the UI to the
  shared shell used by the demo so both surfaces evolve together.
*/
export default async function DashboardPage() {
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
