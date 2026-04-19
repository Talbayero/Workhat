import type { Metadata } from "next";
import { InboxWorkspace } from "@/components/inbox/inbox-workspace";
import type { InboxViewId } from "@/lib/mock-data";

export const metadata: Metadata = { title: "Inbox — Work Hat" };

type Props = {
  searchParams: Promise<{ view?: string }>;
};

export default async function InboxPage({ searchParams }: Props) {
  const { view } = await searchParams;
  return <InboxWorkspace activeView={(view as InboxViewId) ?? "all"} />;
}
