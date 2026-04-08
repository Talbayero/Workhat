import { CompaniesShell } from "@/components/companies/companies-shell";
import { getCompanies } from "@/lib/supabase/queries";

type CompaniesPageProps = {
  searchParams: Promise<{ view?: string }>;
};

export default async function CompaniesPage({ searchParams }: CompaniesPageProps) {
  const { view } = await searchParams;
  const companies = await getCompanies(view);
  return <CompaniesShell companies={companies} activeView={view} />;
}
