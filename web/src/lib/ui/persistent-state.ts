export const UI_STORAGE_KEYS = {
  sidebarCollapsed: "workhat.sidebar.collapsed",
  inboxQueueCollapsed: "workhat.inbox.queue.collapsed",
  inboxQueueWidth: "workhat.inbox.queue.width",
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
