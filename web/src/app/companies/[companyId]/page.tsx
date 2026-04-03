import { CompaniesShell } from "@/components/companies/companies-shell";

type CompanyPageProps = {
  params: Promise<{
    companyId: string;
  }>;
};

export default async function CompanyPage({ params }: CompanyPageProps) {
  const { companyId } = await params;

  return <CompaniesShell selectedCompanyId={companyId} />;
}
