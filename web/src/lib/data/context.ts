import { createClient } from "@/lib/supabase/server";
import { getCurrentAppUser } from "@/lib/auth/app-user";
import { listContextObjectsForOrg, getContextObjectDetail } from "@/lib/context/context-objects";
import type { ContextListStatusFilter } from "@/lib/context/types";

export async function getContextObjects(status: ContextListStatusFilter = "all") {
  const appUser = await getCurrentAppUser({ label: "contexts", select: "id, org_id, role" });
  if (!appUser) return [];

  const supabase = await createClient();
  return listContextObjectsForOrg({
    supabase,
    orgId: appUser.org_id,
    status,
  });
}

export async function getContextObject(contextId: string) {
  const appUser = await getCurrentAppUser({ label: "contexts/:id", select: "id, org_id, role" });
  if (!appUser) return null;

  const supabase = await createClient();
  return getContextObjectDetail({
    supabase,
    orgId: appUser.org_id,
    contextId,
  });
}
