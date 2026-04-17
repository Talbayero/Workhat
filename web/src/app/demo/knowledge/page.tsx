import { KnowledgeShell } from "@/components/knowledge/knowledge-shell";
import { knowledgeEntries } from "@/lib/mock-data";

export default async function DemoKnowledgePage() {
  return (
    <KnowledgeShell
      entries={knowledgeEntries}
      isDemo={true}
      baseDir="/demo"
    />
  );
}
