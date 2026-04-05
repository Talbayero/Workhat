import { InboxWorkspace } from "@/components/inbox/inbox-workspace";
import type { InboxViewId } from "@/lib/mock-data";

type Props = {
  params: Promise<{ conversationId: string }>;
  searchParams: Promise<{ view?: string }>;
};

export default async function InboxConversationPage({ params, searchParams }: Props) {
  const { conversationId } = await params;
  const { view } = await searchParams;
  return (
    <InboxWorkspace
      selectedConversationId={conversationId}
      activeView={(view as InboxViewId) ?? "all"}
    />
  );
}
