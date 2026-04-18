"use client";

import { usePathname } from "next/navigation";
import { Sidebar } from "./sidebar";
import { Topbar } from "./topbar";

const NO_SIDEBAR_ROUTES = ["/login", "/signup", "/onboarding", "/pricing", "/auth", "/checkout", "/compare"];

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
      <Sidebar />
      <div className="flex min-w-0 flex-1 flex-col overflow-hidden">
        <Topbar />
        <div className="min-h-0 flex-1 overflow-hidden">
          {children}
        </div>
      </div>
    </div>
  );
}
