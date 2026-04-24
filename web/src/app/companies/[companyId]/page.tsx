import { notFound } from "next/navigation";
import { CompaniesShell } from "@/components/companies/companies-shell";
import { getCompanies, getCompanyById } from "@/lib/data/companies";
import { getContactsForCompany } from "@/lib/data/contacts";
import { getConversationsForCompany } from "@/lib/data/inbox";

type CompanyPageProps = {
  params: Promise<{ companyId: string }>;
  searchParams: Promise<{ view?: string }>;
};

export default async function CompanyPage({ params, searchParams }: CompanyPageProps) {
  const { companyId } = await params;
  const { view } = await searchParams;

  const [companies, selectedCompany, companyContacts, companyConversations] =
    await Promise.all([
      getCompanies(view),
      getCompanyById(companyId),
      getContactsForCompany(companyId),
      getConversationsForCompany(companyId),
    ]);

  if (!selectedCompany) notFound();

  return (
    <CompaniesShell
      companies={companies}
      selectedCompany={selectedCompany}
      companyContacts={companyContacts}
      companyConversations={companyConversations}
      activeView={view}
    />
  );
}
