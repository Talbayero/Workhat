export const THEME_STORAGE_KEY = "workhat.theme";

export type ThemePreference = "light" | "dark" | "system";
export type ResolvedTheme = "light" | "dark";

export const THEME_OPTIONS: Array<{
  id: ThemePreference;
  label: string;
  description: string;
}> = [
  { id: "light", label: "Light", description: "Warm Work Hat surfaces for daytime use." },
  { id: "dark", label: "Dark", description: "The original low-glare Work Hat workspace." },
  { id: "system", label: "System", description: "Follow this device's color scheme." },
];

type ThemeStorage = Pick<Storage, "getItem" | "setItem">;

export function isThemePreference(value: string | null): value is ThemePreference {
  return value === "light" || value === "dark" || value === "system";
}

export function readThemePreference(storage: ThemeStorage | null | undefined, fallback: ThemePreference = "dark") {
  const stored = storage?.getItem(THEME_STORAGE_KEY) ?? null;
  return isThemePreference(stored) ? stored : fallback;
}

export function writeThemePreference(storage: ThemeStorage | null | undefined, preference: ThemePreference) {
  storage?.setItem(THEME_STORAGE_KEY, preference);
}

export function resolveThemePreference(
  preference: ThemePreference,
  systemPrefersDark: boolean,
): ResolvedTheme {
  if (preference === "system") return systemPrefersDark ? "dark" : "light";
  return preference;
}
