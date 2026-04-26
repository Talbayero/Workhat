import type { Metadata } from "next";
import { getCurrentAppUser } from "@/lib/auth/app-user";
import { hasCapability } from "@/lib/auth/capabilities";
import { getCompanies } from "@/lib/data/companies";
import { getKnowledgeEntries } from "@/lib/data/knowledge";
import { ContextEditor } from "@/components/context/context-editor";

export const metadata: Metadata = {
  title: "New Context — Work Hat",
};

export default async function NewContextPage() {
  const appUser = await getCurrentAppUser({ label: "contexts/new", select: "id, org_id, role" });
  const canEdit = appUser ? await hasCapability(appUser, "context.edit", "contexts/new") : false;
  const canPublish = appUser ? await hasCapability(appUser, "context.publish", "contexts/new") : false;

  const [companies, knowledgeEntries] = await Promise.all([
    getCompanies("all"),
    getKnowledgeEntries("all"),
  ]);

  return (
    <ContextEditor
      mode="create"
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
