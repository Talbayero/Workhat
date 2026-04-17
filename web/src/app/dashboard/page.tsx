import { DashboardShell } from "@/components/dashboard/dashboard-shell";
import {
  getDashboardStats,
  getRecentEditLog,
  getQAQueueFromDB,
  getKnowledgeHealth,
} from "@/lib/supabase/queries";

/*
  Dashboard stays server-rendered for data loading, then hands the UI to the
  shared shell used by the demo so both surfaces evolve together.
*/
export default async function DashboardPage() {
  const [stats, log, qaQueue, knowledgeHealth] = await Promise.all([
    getDashboardStats(),
    getRecentEditLog(8),
    getQAQueueFromDB(),
    getKnowledgeHealth(),
  ]);

  return (
    <DashboardShell
      stats={stats}
      log={log}
      qaQueue={qaQueue}
      knowledgeHealth={knowledgeHealth}
    />
  );
}
