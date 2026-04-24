import type { Metadata } from "next";
import { CompaniesShell } from "@/components/companies/companies-shell";
import { getCompanies } from "@/lib/data/companies";

export const metadata: Metadata = { title: "Companies — Work Hat" };

type CompaniesPageProps = {
  searchParams: Promise<{ view?: string }>;
};

export default async function CompaniesPage({ searchParams }: CompaniesPageProps) {
  const { view } = await searchParams;
  const companies = await getCompanies(view);
  return <CompaniesShell companies={companies} activeView={view} />;
}
