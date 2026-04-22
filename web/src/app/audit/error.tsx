"use client";

import { ErrorFallback } from "@/components/ui/error-fallback";

export default function AuditError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return (
    <ErrorFallback
      error={error}
      title="Audit trail crashed"
      reset={reset}
    />
  );
}
