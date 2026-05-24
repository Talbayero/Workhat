export const QUEUE_MIN_WIDTH = 260;
export const QUEUE_MAX_WIDTH = 460;
export const QUEUE_DEFAULT_WIDTH = 340;
export const QUEUE_KEYBOARD_STEP = 20;
export const MIN_THREAD_WIDTH = 560;

export function clampQueueWidth(width: number) {
  if (!Number.isFinite(width)) return QUEUE_DEFAULT_WIDTH;
  return Math.min(QUEUE_MAX_WIDTH, Math.max(QUEUE_MIN_WIDTH, Math.round(width)));
}

export function resizeQueueWidth(currentWidth: number, direction: "decrease" | "increase") {
  const delta = direction === "increase" ? QUEUE_KEYBOARD_STEP : -QUEUE_KEYBOARD_STEP;
  return clampQueueWidth(currentWidth + delta);
}

export function shouldAutoCollapseQueue(viewportWidth: number, queueWidth: number) {
  if (!Number.isFinite(viewportWidth)) return false;
  return viewportWidth < clampQueueWidth(queueWidth) + MIN_THREAD_WIDTH;
}

export function shouldShowOpenQueue(queueCollapsed: boolean) {
  return queueCollapsed;
}
