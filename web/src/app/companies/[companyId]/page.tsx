import { CompaniesShell } from "@/components/companies/companies-shell";

type CompanyPageProps = {
  params: Promise<{ companyId: string }>;
  searchParams: Promise<{ view?: string }>;
};

export default async function CompanyPage({ params, searchParams }: CompanyPageProps) {
  const { companyId } = await params;
  const { view } = await searchParams;

  return <CompaniesShell selectedCompanyId={companyId} activeView={view} />;
}
