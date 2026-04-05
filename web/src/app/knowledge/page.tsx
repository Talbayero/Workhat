import { KnowledgeShell } from "@/components/knowledge/knowledge-shell";
import type { KnowledgeCategory } from "@/lib/mock-data";

type Props = {
  searchParams: Promise<{ category?: string }>;
};

export default async function KnowledgePage({ searchParams }: Props) {
  const { category } = await searchParams;
  return <KnowledgeShell activeCategory={(category as KnowledgeCategory) ?? "all"} />;
}
