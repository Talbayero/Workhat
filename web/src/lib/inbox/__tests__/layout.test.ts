import { readFileSync } from "node:fs";
import { join } from "node:path";

import {
  clampQueueWidth,
  QUEUE_DEFAULT_WIDTH,
  QUEUE_KEYBOARD_STEP,
  QUEUE_MAX_WIDTH,
  QUEUE_MIN_WIDTH,
  resizeQueueWidth,
  shouldAutoCollapseQueue,
  shouldShowOpenQueue,
} from "@/lib/inbox/layout";

describe("inbox layout helpers", () => {
  it("clamps queue splitter width to workspace bounds", () => {
    expect(clampQueueWidth(120)).toBe(QUEUE_MIN_WIDTH);
    expect(clampQueueWidth(999)).toBe(QUEUE_MAX_WIDTH);
    expect(clampQueueWidth(Number.NaN)).toBe(QUEUE_DEFAULT_WIDTH);
    expect(clampQueueWidth(337.6)).toBe(338);
  });

  it("supports keyboard resizing in fixed steps", () => {
    expect(resizeQueueWidth(340, "decrease")).toBe(340 - QUEUE_KEYBOARD_STEP);
    expect(resizeQueueWidth(340, "increase")).toBe(340 + QUEUE_KEYBOARD_STEP);
    expect(resizeQueueWidth(QUEUE_MIN_WIDTH, "decrease")).toBe(QUEUE_MIN_WIDTH);
    expect(resizeQueueWidth(QUEUE_MAX_WIDTH, "increase")).toBe(QUEUE_MAX_WIDTH);
  });

  it("auto-collapses the queue before the thread is crushed", () => {
    expect(shouldAutoCollapseQueue(840, 340)).toBe(true);
    expect(shouldAutoCollapseQueue(1040, 340)).toBe(false);
  });

  it("shows Open queue only when the queue is collapsed", () => {
    expect(shouldShowOpenQueue(true)).toBe(true);
    expect(shouldShowOpenQueue(false)).toBe(false);
  });

  it("does not render raw width preset labels in the inbox layout", () => {
    const source = readFileSync(
      join(process.cwd(), "src/components/inbox/inbox-layout-client.tsx"),
      "utf8",
    );

    expect(source).not.toContain("Compact");
    expect(source).not.toContain("Comfortable");
    expect(source).not.toContain("Wide");
  });
});
