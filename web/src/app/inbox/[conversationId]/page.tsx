import { InboxWorkspace } from "@/components/inbox/inbox-workspace";

type InboxConversationPageProps = {
  params: Promise<{
    conversationId: string;
  }>;
};

export default async function InboxConversationPage({
  params,
}: InboxConversationPageProps) {
  const { conversationId } = await params;

  return <InboxWorkspace selectedConversationId={conversationId} />;
}
