"use client";
import { ErrorFallback } from "@/components/ui/error-fallback";
export default function KnowledgeError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return <ErrorFallback error={error} reset={reset} title="Knowledge base failed to load" />;
}
