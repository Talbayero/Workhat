import type { Metadata } from "next";
import { InboxWorkspace } from "@/components/inbox/inbox-workspace";
import type { InboxViewId } from "@/lib/inbox/types";

export const metadata: Metadata = { title: "Inbox — Work Hat" };
export const dynamic = "force-dynamic";
export const revalidate = 0;

type Props = {
  searchParams: Promise<{ q?: string; view?: string }>;
};

export default async function InboxPage({ searchParams }: Props) {
  const { q, view } = await searchParams;
  return <InboxWorkspace activeView={(view as InboxViewId) ?? "all"} searchQuery={q ?? ""} />;
}
