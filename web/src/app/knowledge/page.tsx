import type { Metadata } from "next";
import { KnowledgeShell } from "@/components/knowledge/knowledge-shell";
import { getKnowledgeEntries } from "@/lib/data/knowledge";
import type { KnowledgeCategory } from "@/lib/mock-data";

export const metadata: Metadata = { title: "Knowledge — Work Hat" };

type Props = {
  searchParams: Promise<{ category?: string }>;
};

export default async function KnowledgePage({ searchParams }: Props) {
  const { category } = await searchParams;
  const cat = (category as KnowledgeCategory | "all") ?? "all";
  const entries = await getKnowledgeEntries(cat);
  return <KnowledgeShell entries={entries} activeCategory={cat} />;
}
