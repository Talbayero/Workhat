import { InboxWorkspace } from "@/components/inbox/inbox-workspace";
import type { InboxViewId } from "@/lib/mock-data";

type Props = {
  searchParams: Promise<{ view?: string }>;
};

export default async function InboxPage({ searchParams }: Props) {
  const { view } = await searchParams;
  return <InboxWorkspace activeView={(view as InboxViewId) ?? "all"} />;
}
