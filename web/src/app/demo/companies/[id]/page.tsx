import { CompaniesShell } from "@/components/companies/companies-shell";
import { companies } from "@/lib/mock-data";
import { notFound } from "next/navigation";

export default async function DemoCompanyDetailPage({ params }: { params: { id: string } }) {
  const company = companies.find((c) => c.id === params.id);
  
  if (!company) {
    notFound();
  }

  return (
    <CompaniesShell
      initialCompanies={companies}
      selectedCompany={company}
      isDemo={true}
      baseDir="/demo"
    />
  );
}
