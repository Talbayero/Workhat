export type GmailImportResultSummary = {
  scanned?: number;
  imported?: number;
  skipped?: number;
  errors?: number;
  skipReasons?: Record<string, number>;
  errorReasons?: Record<string, number>;
};

export type NormalizedGmailImportResult = Required<
  Pick<GmailImportResultSummary, "scanned" | "imported" | "skipped" | "errors" | "skipReasons" | "errorReasons">
>;

export function normalizeGmailImportResult(data: GmailImportResultSummary): NormalizedGmailImportResult {
  return {
    scanned: data.scanned ?? 0,
    imported: data.imported ?? 0,
    skipped: data.skipped ?? 0,
    errors: data.errors ?? 0,
    skipReasons: data.skipReasons ?? {},
    errorReasons: data.errorReasons ?? {},
  };
}

export function formatGmailImportResult(data: GmailImportResultSummary) {
  const { scanned, imported, skipped, errors } = normalizeGmailImportResult(data);

  if (scanned === 0) {
    return "No recent eligible Gmail messages found. Send a test email to this mailbox, wait a few seconds, then import again.";
  }

  if (scanned > 0 && imported === 0) {
    return "Messages were found but skipped, likely because they were already imported.";
  }

  if (errors > 0) {
    return `Gmail import scanned ${scanned} message${scanned === 1 ? "" : "s"} and hit ${errors} error${errors === 1 ? "" : "s"}. Imported ${imported}, skipped ${skipped}.`;
  }

  return `Gmail import created ${imported} new conversation${imported === 1 ? "" : "s"}. Scanned ${scanned}, skipped ${skipped}. Open Inbox or refresh Inbox to review synced messages.`;
}
