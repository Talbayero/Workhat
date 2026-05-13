"use client";

import { usePathname } from "next/navigation";
import { Sidebar } from "./sidebar";
import { Topbar } from "./topbar";

const NO_SIDEBAR_ROUTES = [
  "/login",
  "/signup",
  "/onboarding",
  "/pricing",
  "/auth",
  "/checkout",
  "/compare",
  "/privacy",
  "/account-deletion",
  "/delete-account",
];

export function AppShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const showSidebar =
    pathname !== "/" &&
    !pathname.match(/^\/(en|es)(\/|$)/) &&
    !NO_SIDEBAR_ROUTES.some((route) => pathname.startsWith(route));

  if (!showSidebar) {
    return <>{children}</>;
  }

  return (
    <div className="flex h-screen overflow-hidden bg-[var(--background)]">
      {/* Skip navigation — visible on focus for keyboard users (WCAG 2.4.1) */}
      <a
        href="#main-content"
        className="sr-only focus:not-sr-only focus:absolute focus:left-3 focus:top-3 focus:z-50 focus:rounded-lg focus:bg-[var(--moss)] focus:px-4 focus:py-2 focus:text-sm focus:font-medium focus:text-white focus:outline-none"
      >
        Skip to main content
      </a>
      <Sidebar />
      <div className="flex min-w-0 flex-1 flex-col overflow-hidden">
        <Topbar />
        <div id="main-content" className="min-h-0 flex-1 overflow-hidden" tabIndex={-1}>
          {children}
        </div>
      </div>
    </div>
  );
}
