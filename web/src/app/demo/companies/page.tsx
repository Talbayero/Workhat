import { CompaniesShell } from "@/components/companies/companies-shell";
import { companies } from "@/lib/mock-data";

export default async function DemoCompaniesPage() {
  return (
    <CompaniesShell
      companies={companies}
      isDemo={true}
      baseDir="/demo"
    />
  );
}
