import { notFound } from "next/navigation";

import {
  filterConversations,
  inboxViews,
} from "@/lib/inbox/filters";
import type { InboxConversation, InboxViewId } from "@/lib/inbox/types";
import { getCurrentAppUser } from "@/lib/auth/app-user";
import { getConversations, getConversationById, getOrgIntentColors } from "@/lib/data/inbox";
import { shouldShowManualConversationControl } from "@/lib/inbox/manual-conversation";
import { InboxLayoutClient } from "./inbox-layout-client";

type InboxWorkspaceProps = {
  selectedConversationId?: string;
  activeView?: InboxViewId;
  searchQuery?: string;
};

export async function InboxWorkspace({
  selectedConversationId,
  activeView = "all",
  searchQuery = "",
  isDemo = false,
  staticConversations,
}: InboxWorkspaceProps & { isDemo?: boolean; staticConversations?: InboxConversation[] }) {
  // Fetch all conversations for sidebar list + view counts + intent colors
  const [allConversations, intentColors, currentUser] = await Promise.all([
    isDemo && staticConversations ? Promise.resolve(staticConversations) : getConversations(),
    isDemo ? Promise.resolve({} as Record<string, string>) : getOrgIntentColors(),
    isDemo
      ? Promise.resolve({ id: null, full_name: "Marcos", role: "admin" })
      : getCurrentAppUser<{ id: string; org_id: string; role: string; full_name?: string }>({
          label: "inbox/workspace",
          select: "id, org_id, role, full_name",
        }),
  ]);

  const filterOptions = {
    currentUserId: currentUser?.id ?? null,
    currentAgentName: currentUser?.full_name ?? null,
    searchQuery,
  };
  const canCreateManualConversation = shouldShowManualConversationControl({
    isDemo,
    callerRole: currentUser?.role ?? null,
  });

  console.info("[inbox] InboxWorkspace loaded conversations:", {
    activeView,
    selectedConversationId: selectedConversationId ?? null,
    isDemo,
    count: allConversations.length,
  });
    
  const filtered = filterConversations(allConversations, activeView, filterOptions);
  console.info("[inbox] InboxWorkspace filtered conversations:", {
    activeView,
    searchQuery: searchQuery || null,
    count: filtered.length,
  });

  // Determine which conversation to show in the thread pane
  const targetId = selectedConversationId ?? filtered[0]?.id;
  let selected: InboxConversation | null = null;

  if (targetId) {
    if (isDemo && staticConversations) {
      selected = staticConversations.find(c => c.id === targetId) ?? null;
    } else {
      selected = await getConversationById(targetId);
    }
    
    if (selectedConversationId && !selected) notFound();
    // Fall back to first in list without messages if fetch failed
    if (!selected) selected = filtered[0] ?? null;
  }

  // Compute real counts from actual data
  const viewCounts = Object.fromEntries(
    inboxViews.map((v) => [v.id, filterConversations(allConversations, v.id, {
      currentUserId: filterOptions.currentUserId,
      currentAgentName: filterOptions.currentAgentName,
    }).length])
  ) as Record<InboxViewId, number>;

  const baseDir = isDemo ? "/demo" : "";
  return (
    <InboxLayoutClient
      allConversations={allConversations}
      filtered={filtered}
      selected={selected}
      activeView={activeView}
      searchQuery={searchQuery}
      viewCounts={viewCounts}
      intentColors={intentColors}
      baseDir={baseDir}
      isDemo={isDemo}
      canCreateManualConversation={canCreateManualConversation}
    />
  );
}
