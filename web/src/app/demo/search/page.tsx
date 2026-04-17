import { SearchShell } from "@/components/search/search-shell";

export default async function DemoSearchPage() {
  return (
    <SearchShell
      isDemo={true}
      baseDir="/demo"
    />
  );
}
