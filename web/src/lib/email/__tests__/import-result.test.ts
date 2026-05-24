import { formatGmailImportResult, normalizeGmailImportResult } from "@/lib/email/import-result";

describe("Gmail import result formatting", () => {
  it("shows the required no-message guidance when nothing was scanned", () => {
    expect(formatGmailImportResult({ scanned: 0, imported: 0, skipped: 0 })).toBe(
      "No recent eligible Gmail messages found. Send a test email to this mailbox, wait a few seconds, then import again."
    );
  });

  it("shows the required duplicate/skipped guidance when messages were scanned but none imported", () => {
    expect(formatGmailImportResult({ scanned: 5, imported: 0, skipped: 5 })).toBe(
      "Messages were found but skipped, likely because they were already imported."
    );
  });

  it("normalizes missing counts and reason maps for result rendering", () => {
    expect(normalizeGmailImportResult({ imported: 2 })).toEqual({
      scanned: 0,
      imported: 2,
      skipped: 0,
      errors: 0,
      skipReasons: {},
      errorReasons: {},
    });
  });
});
