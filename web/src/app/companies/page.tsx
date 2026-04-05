import { CompaniesShell } from "@/components/companies/companies-shell";

type CompaniesPageProps = {
  searchParams: Promise<{ view?: string }>;
};

export default async function CompaniesPage({ searchParams }: CompaniesPageProps) {
  const { view } = await searchParams;
  return <CompaniesShell activeView={view} />;
}
