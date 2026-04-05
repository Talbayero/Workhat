import { KnowledgeShell } from "@/components/knowledge/knowledge-shell";
import type { KnowledgeCategory } from "@/lib/mock-data";

type Props = {
  params: Promise<{ entryId: string }>;
  searchParams: Promise<{ category?: string }>;
};

export default async function KnowledgeEntryPage({ params, searchParams }: Props) {
  const { entryId } = await params;
  const { category } = await searchParams;
  return (
    <KnowledgeShell
      selectedEntryId={entryId}
      activeCategory={(category as KnowledgeCategory) ?? "all"}
    />
  );
}
