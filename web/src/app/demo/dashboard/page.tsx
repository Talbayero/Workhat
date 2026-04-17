import { DashboardShell } from "@/components/dashboard/dashboard-shell";
import { conversations, stats } from "@/lib/mock-data";

const knowledgeHealth = [
  {
    category: "missing_context" as const,
    count: 10,
    avgEditIntensity: 31,
    sampleReasons: [
      "Drafts often need carrier checkpoint and fulfillment status before agents can safely reply.",
      "Agents add account-specific order context that was missing from the draft.",
    ],
  },
  {
    category: "factual" as const,
    count: 12,
    avgEditIntensity: 27,
    sampleReasons: [
      "Agents correct delivery timing and avoid unsupported ETA promises.",
      "Drafts need more precise product or billing details from the customer record.",
    ],
  },
];

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
      knowledgeHealth={knowledgeHealth}
      isDemo={true}
      baseDir="/demo"
    />
  );
}