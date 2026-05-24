"use client";

import { useEffect, useState } from "react";
import {
  isThemePreference,
  resolveThemePreference,
  THEME_STORAGE_KEY,
  type ThemePreference,
} from "@/lib/theme/theme";

type ThemeSwitcherProps = {
  variant?: "sidebar" | "settings";
};

const themeOptions: Array<{ id: ThemePreference; label: string; description: string }> = [
  { id: "light", label: "Light", description: "Warm Work Hat surfaces for daytime use." },
  { id: "dark", label: "Dark", description: "The original low-glare Work Hat workspace." },
  { id: "system", label: "System", description: "Follow this device's color scheme." },
];

function applyThemePreference(preference: ThemePreference) {
  const systemPrefersDark = window.matchMedia("(prefers-color-scheme: dark)").matches;
  const resolved = resolveThemePreference(preference, systemPrefersDark);
  document.documentElement.dataset.theme = resolved;
  document.documentElement.dataset.themePreference = preference;
  return resolved;
}

export function ThemeSwitcher({ variant = "settings" }: ThemeSwitcherProps) {
  const [preference, setPreference] = useState<ThemePreference>("dark");
  const [resolved, setResolved] = useState<"light" | "dark">("dark");

  useEffect(() => {
    const systemQuery = window.matchMedia("(prefers-color-scheme: dark)");
    const frame = window.requestAnimationFrame(() => {
      const stored = window.localStorage.getItem(THEME_STORAGE_KEY);
      const nextPreference = isThemePreference(stored) ? stored : "dark";
      setPreference(nextPreference);
      setResolved(applyThemePreference(nextPreference));
    });

    const handleSystemChange = () => {
      if (window.localStorage.getItem(THEME_STORAGE_KEY) === "system") {
        setResolved(applyThemePreference("system"));
      }
    };

    systemQuery.addEventListener("change", handleSystemChange);
    return () => {
      window.cancelAnimationFrame(frame);
      systemQuery.removeEventListener("change", handleSystemChange);
    };
  }, []);

  const chooseTheme = (nextPreference: ThemePreference) => {
    window.localStorage.setItem(THEME_STORAGE_KEY, nextPreference);
    setPreference(nextPreference);
    setResolved(applyThemePreference(nextPreference));
  };

  if (variant === "sidebar") {
    return (
      <div className="mt-3 rounded-[16px] border border-[var(--line)] bg-[rgba(255,255,255,0.025)] p-2">
        <p className="eyebrow px-1 pb-2 text-[8px] text-[var(--muted)]">Theme</p>
        <div className="grid grid-cols-3 gap-1">
          {themeOptions.map((option) => (
            <button
              key={option.id}
              type="button"
              onClick={() => chooseTheme(option.id)}
              aria-pressed={preference === option.id}
              className={`rounded-full px-2 py-1.5 text-[10px] font-medium transition-colors ${
                preference === option.id
                  ? "bg-[var(--moss)] text-white"
                  : "text-[var(--muted)] hover:bg-[var(--sage)] hover:text-[var(--foreground)]"
              }`}
              title={option.description}
            >
              {option.label}
            </button>
          ))}
        </div>
      </div>
    );
  }

  return (
    <div>
      <div className="mt-5 grid gap-3 sm:grid-cols-3">
        {themeOptions.map((option) => {
          const active = preference === option.id;
          return (
            <button
              key={option.id}
              type="button"
              onClick={() => chooseTheme(option.id)}
              aria-pressed={active}
              className={`rounded-[18px] border p-4 text-left transition-colors ${
                active
                  ? "border-[var(--moss)] bg-[rgba(144,50,61,0.12)]"
                  : "border-[var(--line)] bg-[var(--panel-strong)] hover:border-[var(--line-strong)]"
              }`}
            >
              <span className="text-sm font-semibold">{option.label}</span>
              <span className="mt-2 block text-xs leading-5 text-[var(--muted)]">{option.description}</span>
            </button>
          );
        })}
      </div>
      <p className="mt-4 text-xs text-[var(--muted)]">
        Current render: <span className="font-medium text-[var(--foreground)]">{resolved}</span>
      </p>
    </div>
  );
}
