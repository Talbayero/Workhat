import { notFound } from "next/navigation";
import { KnowledgeShell } from "@/components/knowledge/knowledge-shell";
import { getKnowledgeEntries, getKnowledgeEntryById } from "@/lib/supabase/queries";
import type { KnowledgeCategory } from "@/lib/mock-data";

type Props = {
  params: Promise<{ entryId: string }>;
  searchParams: Promise<{ category?: string }>;
};

export default async function KnowledgeEntryPage({ params, searchParams }: Props) {
  const { entryId } = await params;
  const { category } = await searchParams;
  const cat = (category as KnowledgeCategory | "all") ?? "all";

  const [entries, selectedEntry] = await Promise.all([
    getKnowledgeEntries(cat),
    getKnowledgeEntryById(entryId),
  ]);

  if (!selectedEntry) notFound();

  return (
    <KnowledgeShell
      entries={entries}
      selectedEntry={selectedEntry}
      activeCategory={cat}
    />
  );
}
