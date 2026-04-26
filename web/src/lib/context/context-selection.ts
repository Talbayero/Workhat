import { createClient } from "@/lib/supabase/server";
import { listContextObjectsForOrg, resolveDraftContextSelection } from "@/lib/context/context-objects";
import type { ContextDraftSelection, ContextObjectSummary } from "@/lib/context/types";

export async function getActiveContextSelections(orgId: string): Promise<ContextObjectSummary[]> {
  const supabase = await createClient();
  return listContextObjectsForOrg({
    supabase,
    orgId,
    status: "active",
  });
}

export async function getDraftContextSelectionForOrg(
  orgId: string,
  contextObjectId: string
): Promise<ContextDraftSelection | null> {
  const supabase = await createClient();
  return resolveDraftContextSelection({
    supabase,
    orgId,
    contextObjectId,
  });
}
