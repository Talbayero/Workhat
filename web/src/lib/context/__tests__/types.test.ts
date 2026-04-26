import { emptyContextDefinition, normalizeContextDefinition } from "@/lib/context/types";

describe("Context definition normalization", () => {
  it("returns the lean default shape for empty input", () => {
    expect(normalizeContextDefinition(null)).toEqual(emptyContextDefinition());
  });

  it("trims, deduplicates, and caps list fields", () => {
    const normalized = normalizeContextDefinition({
      when_to_use: "  Renewal exception handling  ",
      required_info: [" contract tier ", "contract tier", "", "billing owner"],
      prohibited_actions: ["Promise refunds", "Promise refunds", "  "],
    });

    expect(normalized.when_to_use).toBe("Renewal exception handling");
    expect(normalized.required_info).toEqual(["contract tier", "billing owner"]);
    expect(normalized.prohibited_actions).toEqual(["Promise refunds"]);
  });

  it("keeps only valid knowledge entry ids", () => {
    const normalized = normalizeContextDefinition({
      knowledge_entry_ids: [
        "4f3a838a-e914-4bb4-9c77-ffdb31dc03c5",
        "not-a-uuid",
        "4f3a838a-e914-4bb4-9c77-ffdb31dc03c5",
      ],
    });

    expect(normalized.knowledge_entry_ids).toEqual([
      "4f3a838a-e914-4bb4-9c77-ffdb31dc03c5",
    ]);
  });
});
