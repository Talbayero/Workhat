import {
  getQueueWidthForPreset,
  QUEUE_WIDTH_PRESETS,
  shouldShowOpenQueue,
} from "@/lib/inbox/layout";

describe("inbox layout helpers", () => {
  it("uses clear queue width presets instead of arbitrary slider values", () => {
    expect(QUEUE_WIDTH_PRESETS.compact.label).toBe("Compact");
    expect(getQueueWidthForPreset("compact")).toBeLessThan(getQueueWidthForPreset("comfortable"));
    expect(getQueueWidthForPreset("wide")).toBeGreaterThan(getQueueWidthForPreset("comfortable"));
  });

  it("shows Open queue only when the queue is collapsed", () => {
    expect(shouldShowOpenQueue(true)).toBe(true);
    expect(shouldShowOpenQueue(false)).toBe(false);
  });
});
