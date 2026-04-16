import { InboxWorkspace } from "@/components/inbox/inbox-workspace";
import { conversations, type InboxViewId } from "@/lib/mock-data";

type Props = {
  searchParams: Promise<{ view?: string }>;
};

export default async function DemoInboxPage({ searchParams }: Props) {
  const { view } = await searchParams;
  return (
    <InboxWorkspace 
      activeView={(view as InboxViewId) ?? "all"} 
      isDemo={true} 
      staticConversations={conversations}
    />
  );
}
