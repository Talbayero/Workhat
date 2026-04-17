import { KnowledgeShell } from "@/components/knowledge/knowledge-shell";
import { knowledgeEntries } from "@/lib/mock-data";
import { notFound } from "next/navigation";

export default async function DemoKnowledgeDetailPage({ params }: { params: { id: string } }) {
  const entry = knowledgeEntries.find((e) => e.id === params.id);
  
  if (!entry) {
    notFound();
  }

  return (
    <KnowledgeShell
      entries={knowledgeEntries}
      selectedEntry={entry}
      isDemo={true}
      baseDir="/demo"
    />
  );
}
