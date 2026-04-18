"use client";
import { ErrorFallback } from "@/components/ui/error-fallback";
export default function ContactError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return <ErrorFallback error={error} reset={reset} title="Contact failed to load" />;
}
