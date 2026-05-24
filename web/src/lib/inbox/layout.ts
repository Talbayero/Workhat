export const QUEUE_WIDTH_PRESETS = {
  compact: {
    label: "Compact",
    width: 280,
    description: "More room for the thread.",
  },
  comfortable: {
    label: "Comfortable",
    width: 340,
    description: "Balanced queue and thread.",
  },
  wide: {
    label: "Wide",
    width: 400,
    description: "More room for queue scanning.",
  },
} as const;

export type QueueWidthPreset = keyof typeof QUEUE_WIDTH_PRESETS;

export const QUEUE_WIDTH_PRESET_VALUES = Object.keys(QUEUE_WIDTH_PRESETS) as QueueWidthPreset[];

export function getQueueWidthForPreset(preset: QueueWidthPreset) {
  return QUEUE_WIDTH_PRESETS[preset].width;
}

export function shouldShowOpenQueue(queueCollapsed: boolean) {
  return queueCollapsed;
}
