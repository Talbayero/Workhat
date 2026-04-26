import type { Metadata } from "next";
import { getCurrentAppUser } from "@/lib/auth/app-user";
import { hasCapability } from "@/lib/auth/capabilities";
import { getContextObjects } from "@/lib/data/context";
import { ContextLibrary } from "@/components/context/context-library";
import type { ContextListStatusFilter } from "@/lib/context/types";

export const metadata: Metadata = {
  title: "Contexts — Work Hat",
};

type Props = {
  searchParams: Promise<{ status?: string }>;
};

export default async function ContextsPage({ searchParams }: Props) {
  const { status } = await searchParams;
  const activeStatus: ContextListStatusFilter =
    status === "draft" || status === "active" || status === "archived" ? status : "all";

  const [appUser, contexts] = await Promise.all([
    getCurrentAppUser({ label: "contexts/page", select: "id, org_id, role" }),
    getContextObjects(activeStatus),
  ]);

  const canEdit = appUser ? await hasCapability(appUser, "context.edit", "contexts/page") : false;

  return <ContextLibrary contexts={contexts} activeStatus={activeStatus} canEdit={canEdit} />;
}
