"use client";

import Link from "next/link";
import { useState } from "react";
import type { Dictionary, Locale } from "@/lib/dictionaries";

export function NavBar({
  dict,
  lang,
  routePath = "",
}: {
  dict: Dictionary["nav"];
  lang: Locale;
  routePath?: string;
}) {
  const [open, setOpen] = useState(false);
  const switchPath = routePath === "/" ? "" : routePath;

  return (
    <header className="sticky top-0 z-50 border-b border-[var(--line)] bg-[rgba(10,9,8,0.85)] backdrop-blur-xl">
      <div className="mx-auto flex max-w-6xl items-center justify-between gap-6 px-6 py-4">
        {/* Logo */}
        <Link
          href={`/${lang}`}
          className="flex items-center gap-2.5"
          onClick={() => setOpen(false)}
        >
          <div className="flex h-7 w-7 items-center justify-center rounded-[8px] bg-[var(--sky)] border border-transparent">
            <img src="/logo.png" alt="Work Hat" className="h-5 w-5 object-contain" />
          </div>
          <span className="text-sm font-semibold tracking-tight">Work Hat</span>
        </Link>

        {/* Desktop nav */}
        <nav className="hidden items-center gap-6 md:flex" aria-label="Site navigation">
          <Link href={`/${lang}#how-it-works`} className="text-sm text-[var(--muted)] transition-colors hover:text-[var(--foreground)]">{dict.howItWorks}</Link>
          <Link href="/demo/inbox" className="text-sm text-[var(--muted)] transition-colors hover:text-[var(--foreground)]">{dict.demo}</Link>
          <Link href={`/${lang}/compare`} className="text-sm text-[var(--muted)] transition-colors hover:text-[var(--foreground)]">{dict.compare}</Link>
          <Link href={`/${lang}/pricing`} className="text-sm text-[var(--muted)] transition-colors hover:text-[var(--foreground)]">{dict.pricing}</Link>
        </nav>

        {/* Desktop right side */}
        <div className="hidden items-center gap-3 sm:flex">
          <div className="flex items-center gap-2 border-r border-[var(--line)] pr-3 mr-1">
            <Link href={`/en${switchPath}`} className={`text-xs font-medium transition-colors ${lang === "en" ? "text-[var(--foreground)]" : "text-[var(--muted)] hover:text-white"}`}>EN</Link>
            <Link href={`/es${switchPath}`} className={`text-xs font-medium transition-colors ${lang === "es" ? "text-[var(--foreground)]" : "text-[var(--muted)] hover:text-white"}`}>ES</Link>
          </div>
          <Link href="/login" className="text-sm text-[var(--muted)] transition-colors hover:text-[var(--foreground)]">
            {dict.signIn}
          </Link>
          <Link
            href="/demo/inbox"
            className="rounded-full border border-[var(--moss)] px-4 py-2 text-sm font-medium text-[var(--moss)] transition-colors hover:bg-[var(--moss)] hover:text-white hidden md:block"
          >
            {dict.tryDemo}
          </Link>
          <Link
            href="#waitlist"
            className="rounded-full bg-[var(--moss)] px-4 py-2 text-sm font-medium text-white transition-opacity hover:opacity-90"
          >
            {dict.getEarlyAccess}
          </Link>
        </div>

        {/* Mobile: CTA + hamburger */}
        <div className="flex items-center gap-2 sm:hidden">
          <Link
            href="#waitlist"
            className="rounded-full bg-[var(--moss)] px-4 py-2 text-sm font-medium text-white transition-opacity hover:opacity-90"
            onClick={() => setOpen(false)}
          >
            {dict.getEarlyAccess}
          </Link>
          <button
            type="button"
            aria-label={open ? "Close menu" : "Open menu"}
            aria-expanded={open}
            aria-controls="mobile-menu"
            onClick={() => setOpen((v) => !v)}
            className="flex h-9 w-9 items-center justify-center rounded-[10px] border border-[var(--line)] bg-[var(--panel-strong)] text-[var(--foreground)]"
          >
            {open ? (
              /* X icon */
              <svg width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden="true">
                <path d="M3 3l10 10M13 3L3 13" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
              </svg>
            ) : (
              /* Hamburger icon */
              <svg width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden="true">
                <path d="M2 4h12M2 8h12M2 12h12" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
              </svg>
            )}
          </button>
        </div>
      </div>

      {/* Mobile menu drawer */}
      {open && (
        <nav
          id="mobile-menu"
          aria-label="Mobile navigation"
          className="border-t border-[var(--line)] bg-[rgba(10,9,8,0.95)] px-6 py-5 sm:hidden"
        >
          <ul className="space-y-1">
            <li>
              <Link
                href={`/${lang}#how-it-works`}
                onClick={() => setOpen(false)}
                className="block rounded-[10px] px-3 py-2.5 text-sm text-[var(--muted)] transition-colors hover:bg-white/5 hover:text-[var(--foreground)]"
              >
                {dict.howItWorks}
              </Link>
            </li>
            <li>
              <Link
                href="/demo/inbox"
                onClick={() => setOpen(false)}
                className="block rounded-[10px] px-3 py-2.5 text-sm text-[var(--muted)] transition-colors hover:bg-white/5 hover:text-[var(--foreground)]"
              >
                {dict.demo}
              </Link>
            </li>
            <li>
              <Link
                href={`/${lang}/compare`}
                onClick={() => setOpen(false)}
                className="block rounded-[10px] px-3 py-2.5 text-sm text-[var(--muted)] transition-colors hover:bg-white/5 hover:text-[var(--foreground)]"
              >
                {dict.compare}
              </Link>
            </li>
            <li>
              <Link
                href={`/${lang}/pricing`}
                onClick={() => setOpen(false)}
                className="block rounded-[10px] px-3 py-2.5 text-sm text-[var(--muted)] transition-colors hover:bg-white/5 hover:text-[var(--foreground)]"
              >
                {dict.pricing}
              </Link>
            </li>
            <li>
              <Link
                href="/login"
                onClick={() => setOpen(false)}
                className="block rounded-[10px] px-3 py-2.5 text-sm text-[var(--muted)] transition-colors hover:bg-white/5 hover:text-[var(--foreground)]"
              >
                {dict.signIn}
              </Link>
            </li>
          </ul>

          <div className="mt-4 flex items-center gap-2 border-t border-[var(--line)] pt-4">
            <span className="text-xs text-[var(--muted)]">Language:</span>
            <Link
              href={`/en${switchPath}`}
              onClick={() => setOpen(false)}
              className={`text-xs font-medium transition-colors ${lang === "en" ? "text-[var(--foreground)]" : "text-[var(--muted)] hover:text-white"}`}
            >
              EN
            </Link>
            <span className="text-xs text-[var(--muted)]">/</span>
            <Link
              href={`/es${switchPath}`}
              onClick={() => setOpen(false)}
              className={`text-xs font-medium transition-colors ${lang === "es" ? "text-[var(--foreground)]" : "text-[var(--muted)] hover:text-white"}`}
            >
              ES
            </Link>
          </div>
        </nav>
      )}
    </header>
  );
}
