import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { getCurrentAppUser } from "@/lib/auth/app-user";
import { hasCapability } from "@/lib/auth/capabilities";
import { getCompanies } from "@/lib/data/companies";
import { getContextObject } from "@/lib/data/context";
import { getKnowledgeEntries } from "@/lib/data/knowledge";
import { ContextEditor } from "@/components/context/context-editor";

export const metadata: Metadata = {
  title: "Context Detail — Work Hat",
};

type Props = {
  params: Promise<{ contextId: string }>;
};

export default async function ContextDetailPage({ params }: Props) {
  const { contextId } = await params;
  const [appUser, contextObject, companies, knowledgeEntries] = await Promise.all([
    getCurrentAppUser({ label: "contexts/:id/page", select: "id, org_id, role" }),
    getContextObject(contextId),
    getCompanies("all"),
    getKnowledgeEntries("all"),
  ]);

  if (!contextObject) {
    notFound();
  }

  const canEdit = appUser ? await hasCapability(appUser, "context.edit", "contexts/:id/page") : false;
  const canPublish = appUser ? await hasCapability(appUser, "context.publish", "contexts/:id/page") : false;

  return (
    <ContextEditor
      mode="edit"
      contextObject={contextObject}
      companies={companies.map((company) => ({ id: company.id, name: company.name }))}
      knowledgeEntries={knowledgeEntries.map((entry) => ({
        id: entry.id,
        title: entry.title,
        summary: entry.summary,
        category: entry.category,
      }))}
      canEdit={canEdit}
      canPublish={canPublish}
    />
  );
}
