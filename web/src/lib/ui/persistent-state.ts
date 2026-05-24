export const UI_STORAGE_KEYS = {
  sidebarCollapsed: "workhat.sidebar.collapsed",
  inboxQueueCollapsed: "workhat.inbox.queue.collapsed",
  inboxQueueWidth: "workhat.inbox.queue.width",
  inboxQueueWidthPreset: "workhat.inbox.queue.widthPreset",
} as const;

type StorageLike = Pick<Storage, "getItem" | "setItem">;

export function readStoredBoolean(
  storage: StorageLike | null | undefined,
  key: string,
  fallback: boolean,
) {
  const value = storage?.getItem(key);
  if (value === "true") return true;
  if (value === "false") return false;
  return fallback;
}

export function writeStoredBoolean(
  storage: StorageLike | null | undefined,
  key: string,
  value: boolean,
) {
  storage?.setItem(key, String(value));
}

export function readStoredNumber(
  storage: StorageLike | null | undefined,
  key: string,
  options: { fallback: number; min: number; max: number },
) {
  const parsed = Number(storage?.getItem(key));
  if (!Number.isFinite(parsed)) return options.fallback;
  return Math.min(options.max, Math.max(options.min, parsed));
}

export function writeStoredNumber(
  storage: StorageLike | null | undefined,
  key: string,
  value: number,
) {
  storage?.setItem(key, String(value));
}

export function readStoredString<T extends string>(
  storage: StorageLike | null | undefined,
  key: string,
  allowedValues: readonly T[],
  fallback: T,
) {
  const value = storage?.getItem(key);
  return allowedValues.includes(value as T) ? (value as T) : fallback;
}

export function writeStoredString(
  storage: StorageLike | null | undefined,
  key: string,
  value: string,
) {
  storage?.setItem(key, value);
}
