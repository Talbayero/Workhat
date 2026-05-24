"use client";

import { useEffect, useRef, useState } from "react";
import {
  readThemePreference,
  resolveThemePreference,
  THEME_OPTIONS,
  type ThemePreference,
  writeThemePreference,
} from "@/lib/theme/theme";

type ThemeSwitcherProps = {
  variant?: "sidebar" | "settings";
};

function applyThemePreference(preference: ThemePreference) {
  const systemPrefersDark = window.matchMedia("(prefers-color-scheme: dark)").matches;
  const resolved = resolveThemePreference(preference, systemPrefersDark);
  document.documentElement.dataset.theme = resolved;
  document.documentElement.dataset.themePreference = preference;
  return resolved;
}

function ThemeIcon({ preference }: { preference: ThemePreference }) {
  if (preference === "light") {
    return (
      <svg width="15" height="15" viewBox="0 0 15 15" fill="none" aria-hidden="true">
        <circle cx="7.5" cy="7.5" r="2.6" stroke="currentColor" strokeWidth="1.3" />
        <path d="M7.5 1.5v1.1M7.5 12.4v1.1M1.5 7.5h1.1M12.4 7.5h1.1M3.2 3.2l.8.8M11 11l.8.8M11.8 3.2l-.8.8M4 11l-.8.8" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" />
      </svg>
    );
  }

  if (preference === "system") {
    return (
      <svg width="15" height="15" viewBox="0 0 15 15" fill="none" aria-hidden="true">
        <rect x="2" y="2.5" width="11" height="8" rx="1.5" stroke="currentColor" strokeWidth="1.3" />
        <path d="M5.5 13h4M7.5 10.5V13" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" />
      </svg>
    );
  }

  return (
    <svg width="15" height="15" viewBox="0 0 15 15" fill="none" aria-hidden="true">
      <path d="M10.8 10.3c-3.3 0-6-2.7-6-6 0-.7.1-1.3.3-1.9A5.8 5.8 0 1012.6 9c-.6.8-1.1 1.3-1.8 1.3z" stroke="currentColor" strokeWidth="1.3" strokeLinejoin="round" />
    </svg>
  );
}

export function ThemeSwitcher({ variant = "settings" }: ThemeSwitcherProps) {
  const [preference, setPreference] = useState<ThemePreference>("dark");
  const [resolved, setResolved] = useState<"light" | "dark">("dark");
  const [menuOpen, setMenuOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const systemQuery = window.matchMedia("(prefers-color-scheme: dark)");
    const frame = window.requestAnimationFrame(() => {
      const nextPreference = readThemePreference(window.localStorage);
      setPreference(nextPreference);
      setResolved(applyThemePreference(nextPreference));
    });

    const handleSystemChange = () => {
      if (readThemePreference(window.localStorage) === "system") {
        setResolved(applyThemePreference("system"));
      }
    };

    systemQuery.addEventListener("change", handleSystemChange);
    return () => {
      window.cancelAnimationFrame(frame);
      systemQuery.removeEventListener("change", handleSystemChange);
    };
  }, []);

  useEffect(() => {
    if (!menuOpen) return;

    const handlePointerDown = (event: MouseEvent) => {
      if (!menuRef.current?.contains(event.target as Node)) {
        setMenuOpen(false);
      }
    };

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") setMenuOpen(false);
    };

    document.addEventListener("mousedown", handlePointerDown);
    document.addEventListener("keydown", handleKeyDown);
    return () => {
      document.removeEventListener("mousedown", handlePointerDown);
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, [menuOpen]);

  const chooseTheme = (nextPreference: ThemePreference) => {
    writeThemePreference(window.localStorage, nextPreference);
    setPreference(nextPreference);
    setResolved(applyThemePreference(nextPreference));
    setMenuOpen(false);
  };

  if (variant === "sidebar") {
    return (
      <div ref={menuRef} className="relative">
        <button
          type="button"
          onClick={() => setMenuOpen((value) => !value)}
          aria-label="Theme preference"
          aria-haspopup="menu"
          aria-expanded={menuOpen}
          className="flex h-8 w-8 items-center justify-center rounded-full border border-[var(--line)] bg-[var(--panel-strong)] text-[var(--muted)] transition-colors hover:border-[var(--moss)] hover:text-[var(--foreground)] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--moss)]"
          title={`Theme: ${preference}`}
        >
          <ThemeIcon preference={preference} />
        </button>

        {menuOpen && (
          <div
            role="menu"
            aria-label="Choose theme"
            className="absolute bottom-10 right-0 z-30 w-44 overflow-hidden rounded-[16px] border border-[var(--line)] bg-[var(--panel)] p-1 shadow-[0_18px_55px_rgba(0,0,0,0.35)]"
          >
            {THEME_OPTIONS.map((option) => {
              const active = preference === option.id;
              return (
                <button
                  key={option.id}
                  type="button"
                  role="menuitemradio"
                  aria-checked={active}
                  onClick={() => chooseTheme(option.id)}
                  className={`flex w-full items-center gap-2 rounded-[12px] px-3 py-2 text-left text-xs transition-colors ${
                    active
                      ? "bg-[var(--sage)] text-[var(--foreground)]"
                      : "text-[var(--muted)] hover:bg-[var(--sage)] hover:text-[var(--foreground)]"
                  }`}
                >
                  <ThemeIcon preference={option.id} />
                  <span className="flex-1">{option.label}</span>
                  {active && <span aria-hidden="true" className="text-[10px]">✓</span>}
                </button>
              );
            })}
          </div>
        )}
      </div>
    );
  }

  return (
    <div>
      <div className="mt-5 overflow-hidden rounded-[18px] border border-[var(--line)] bg-[var(--panel-strong)]">
        {THEME_OPTIONS.map((option) => {
          const active = preference === option.id;
          return (
            <button
              key={option.id}
              type="button"
              onClick={() => chooseTheme(option.id)}
              aria-pressed={active}
              className={`flex w-full items-start gap-3 border-b border-[var(--line)] px-4 py-3 text-left last:border-b-0 transition-colors ${
                active
                  ? "bg-[rgba(144,50,61,0.1)]"
                  : "hover:bg-[var(--sage)]"
              }`}
            >
              <span className={`mt-0.5 flex h-4 w-4 shrink-0 items-center justify-center rounded-full border ${
                active ? "border-[var(--moss)] bg-[var(--moss)]" : "border-[var(--line-strong)]"
              }`}>
                {active && <span className="h-1.5 w-1.5 rounded-full bg-white" />}
              </span>
              <span className="min-w-0">
                <span className="block text-sm font-semibold">{option.label}</span>
                <span className="mt-1 block text-xs leading-5 text-[var(--muted)]">{option.description}</span>
              </span>
            </button>
          );
        })}
      </div>
      <p className="mt-3 text-xs text-[var(--muted)]">
        Active appearance: <span className="font-medium text-[var(--foreground)]">{resolved}</span>
      </p>
    </div>
  );
}
