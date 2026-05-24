"use client";

import { useEffect } from "react";
import {
  isThemePreference,
  resolveThemePreference,
  THEME_STORAGE_KEY,
  type ThemePreference,
} from "@/lib/theme/theme";

function applyThemePreference(preference: ThemePreference) {
  const systemQuery = window.matchMedia("(prefers-color-scheme: dark)");
  const resolved = resolveThemePreference(preference, systemQuery.matches);
  document.documentElement.dataset.theme = resolved;
  document.documentElement.dataset.themePreference = preference;
}

export function ThemeController() {
  useEffect(() => {
    const stored = window.localStorage.getItem(THEME_STORAGE_KEY);
    const preference: ThemePreference = isThemePreference(stored) ? stored : "dark";
    const systemQuery = window.matchMedia("(prefers-color-scheme: dark)");

    applyThemePreference(preference);

    const handleStorage = (event: StorageEvent) => {
      if (event.key !== THEME_STORAGE_KEY) return;
      applyThemePreference(isThemePreference(event.newValue) ? event.newValue : "dark");
    };

    const handleSystemChange = () => {
      const current = window.localStorage.getItem(THEME_STORAGE_KEY);
      if (current === "system") applyThemePreference("system");
    };

    window.addEventListener("storage", handleStorage);
    systemQuery.addEventListener("change", handleSystemChange);

    return () => {
      window.removeEventListener("storage", handleStorage);
      systemQuery.removeEventListener("change", handleSystemChange);
    };
  }, []);

  return null;
}
