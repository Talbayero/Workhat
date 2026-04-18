"use client";
import { ErrorFallback } from "@/components/ui/error-fallback";
export default function KnowledgeEntryError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return <ErrorFallback error={error} reset={reset} title="Knowledge entry failed to load" />;
}
