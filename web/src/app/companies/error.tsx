"use client";
import { ErrorFallback } from "@/components/ui/error-fallback";
export default function CompaniesError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return <ErrorFallback error={error} reset={reset} title="Companies failed to load" />;
}
