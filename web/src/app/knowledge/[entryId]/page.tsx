import { KnowledgeShell } from "@/components/knowledge/knowledge-shell";

type Props = {
  params: Promise<{ entryId: string }>;
};

export default async function KnowledgeEntryPage({ params }: Props) {
  const { entryId } = await params;
  return <KnowledgeShell selectedEntryId={entryId} />;
}
