import { DashboardShell } from "@/components/dashboard/dashboard-shell";
import { conversations, stats } from "@/lib/mock-data";

export default async function DemoDashboardPage() {
  const qaQueue = conversations.filter(
    (conversation) =>
      conversation.riskLevel === "red" ||
      conversation.riskLevel === "yellow" ||
      conversation.aiConfidence === "red" ||
      conversation.aiConfidence === "yellow"
  );

  return (
    <DashboardShell
      stats={stats}
      log={[]}
      qaQueue={qaQueue}
      isDemo={true}
      baseDir="/demo"
    />
  );
}