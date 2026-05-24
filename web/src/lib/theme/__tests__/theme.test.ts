import {
  isThemePreference,
  readThemePreference,
  resolveThemePreference,
  THEME_OPTIONS,
  THEME_STORAGE_KEY,
  writeThemePreference,
} from "@/lib/theme/theme";

function createMemoryStorage() {
  const values = new Map<string, string>();
  return {
    getItem: (key: string) => values.get(key) ?? null,
    setItem: (key: string, value: string) => {
      values.set(key, value);
    },
  };
}

describe("theme preference helpers", () => {
  it("defines all Settings Appearance options", () => {
    expect(THEME_OPTIONS.map((option) => option.label)).toEqual(["Light", "Dark", "System"]);
    expect(THEME_OPTIONS.every((option) => option.description.length > 0)).toBe(true);
  });

  it("validates supported theme preferences", () => {
    expect(isThemePreference("light")).toBe(true);
    expect(isThemePreference("dark")).toBe(true);
    expect(isThemePreference("system")).toBe(true);
    expect(isThemePreference("sepia")).toBe(false);
  });

  it("resolves system preference deterministically", () => {
    expect(resolveThemePreference("light", true)).toBe("light");
    expect(resolveThemePreference("dark", false)).toBe("dark");
    expect(resolveThemePreference("system", true)).toBe("dark");
    expect(resolveThemePreference("system", false)).toBe("light");
  });

  it("persists theme preference in the expected storage key", () => {
    const storage = createMemoryStorage();

    writeThemePreference(storage, "system");

    expect(storage.getItem(THEME_STORAGE_KEY)).toBe("system");
    expect(readThemePreference(storage)).toBe("system");
    storage.setItem(THEME_STORAGE_KEY, "invalid");
    expect(readThemePreference(storage)).toBe("dark");
  });
});
