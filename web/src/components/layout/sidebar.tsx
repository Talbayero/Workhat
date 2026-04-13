"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";

// Minimal shape of what we actually use from supabase-js User
interface AuthUser {
  id: string;
  email?: string;
  user_metadata: Record<string, unknown>;
}

const navItems = [
  {
    href: "/inbox",
    label: "Inbox",
    icon: (
      <svg width="17" height="17" viewBox="0 0 17 17" fill="none" aria-hidden="true">
        <rect x="1.5" y="2" width="14" height="13" rx="2" stroke="currentColor" strokeWidth="1.5" />
        <path d="M1.5 10.5h4l2 2h3l2-2h4" stroke="currentColor" strokeWidth="1.5" strokeLinejoin="round" />
      </svg>
    ),
  },
  {
    href: "/contacts",
    label: "Contacts",
    icon: (
      <svg width="17" height="17" viewBox="0 0 17 17" fill="none" aria-hidden="true">
        <circle cx="8.5" cy="6" r="3" stroke="currentColor" strokeWidth="1.5" />
        <path d="M2.5 15.5c0-3.314 2.686-5.5 6-5.5s6 2.186 6 5.5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
      </svg>
    ),
  },
  {
    href: "/companies",
    label: "Companies",
    icon: (
      <svg width="17" height="17" viewBox="0 0 17 17" fill="none" aria-hidden="true">
        <rect x="1.5" y="5.5" width="9" height="10" rx="1.5" stroke="currentColor" strokeWidth="1.5" />
        <path d="M6 5.5V3a1 1 0 011-1h6.5a1 1 0 011 1v12.5" stroke="currentColor" strokeWidth="1.5" />
        <path d="M4 9.5h3.5M4 12.5h3.5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
      </svg>
    ),
  },
  {
    href: "/knowledge",
    label: "Knowledge",
    icon: (
      <svg width="17" height="17" viewBox="0 0 17 17" fill="none" aria-hidden="true">
        <path d="M3 2.5h8a1.5 1.5 0 011.5 1.5v9A1.5 1.5 0 0111 14.5H3a1.5 1.5 0 01-1.5-1.5V4A1.5 1.5 0 013 2.5z" stroke="currentColor" strokeWidth="1.5" />
        <path d="M5 6h5M5 8.5h5M5 11h3" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
        <path d="M12.5 5.5L15 3M12.5 11.5L15 14" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
      </svg>
    ),
  },
  {
    href: "/dashboard",
    label: "Dashboard",
    icon: (
      <svg width="17" height="17" viewBox="0 0 17 17" fill="none" aria-hidden="true">
        <rect x="1.5" y="9.5" width="3.5" height="6" rx="1" stroke="currentColor" strokeWidth="1.5" />
        <rect x="6.75" y="5.5" width="3.5" height="10" rx="1" stroke="currentColor" strokeWidth="1.5" />
        <rect x="12" y="1.5" width="3.5" height="14" rx="1" stroke="currentColor" strokeWidth="1.5" />
      </svg>
    ),
  },
  {
    href: "/settings",
    label: "Settings",
    icon: (
      <svg width="17" height="17" viewBox="0 0 17 17" fill="none" aria-hidden="true">
        <circle cx="8.5" cy="8.5" r="2.5" stroke="currentColor" strokeWidth="1.5" />
        <path
          d="M8.5 1.5v1.75M8.5 13.75v1.75M1.5 8.5h1.75M13.75 8.5H15.5M3.55 3.55l1.24 1.24M12.21 12.21l1.24 1.24M13.45 3.55l-1.24 1.24M4.79 12.21l-1.24 1.24"
          stroke="currentColor"
          strokeWidth="1.5"
          strokeLinecap="round"
        />
      </svg>
    ),
  },
];

const primaryItems = navItems.slice(0, 5);
const configItems = navItems.slice(5);

export function Sidebar() {
  const pathname = usePathname();
  const router = useRouter();
  const [user, setUser] = useState<AuthUser | null>(null);

  useEffect(() => {
    const supabase = createClient();

    // Get current session on mount
    supabase.auth.getUser().then(({ data }: { data: { user: AuthUser | null } }) =>
      setUser(data.user)
    );

    // Subscribe to auth changes (login / logout from another tab)
    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      (_event: unknown, session: { user: AuthUser } | null) => {
        setUser(session?.user ?? null);
      }
    );

    return () => subscription.unsubscribe();
  }, []);

  async function handleSignOut() {
    const supabase = createClient();
    await supabase.auth.signOut();
    router.push("/login");
    router.refresh();
  }

  // Derive display name from user metadata or email
  const displayName =
    (user?.user_metadata?.full_name as string | undefined) ||
    (user?.user_metadata?.name as string | undefined) ||
    user?.email?.split("@")[0] ||
    "Agent";
  const initials = displayName.slice(0, 1).toUpperCase();

  return (
    <aside className="grain-panel flex h-full w-[228px] shrink-0 flex-col border-r border-[var(--line)]">
      <div className="shrink-0 border-b border-[var(--line)] px-5 py-5">
        <p className="eyebrow text-[10px] text-[var(--muted)]">Work Hat OS</p>
        <p className="mt-1 text-sm font-semibold tracking-tight">Support operations</p>
        <p className="mt-1 text-xs leading-5 text-[var(--muted)]">
          Conversation-first CRM for measurable AI improvement.
        </p>
      </div>

      <nav className="flex flex-1 flex-col overflow-y-auto scroll-soft px-3 py-4">
        <div>
          <p className="eyebrow px-3 pb-2 text-[9px] text-[var(--muted)]">Workspace</p>
          <div className="flex flex-col gap-0.5">
            {primaryItems.map((item) => {
              const isActive = pathname.startsWith(item.href);
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  className={`flex items-center gap-3 rounded-2xl px-3 py-2.5 text-sm transition-colors ${
                    isActive
                      ? "bg-[var(--moss)] text-white shadow-[0_0_0_1px_rgba(144,50,61,0.35)]"
                      : "text-[var(--muted)] hover:bg-[var(--sage)] hover:text-[var(--foreground)]"
                  }`}
                >
                  <span className="shrink-0">{item.icon}</span>
                  <span>{item.label}</span>
                </Link>
              );
            })}
          </div>
        </div>

        <div className="mt-6">
          <p className="eyebrow px-3 pb-2 text-[9px] text-[var(--muted)]">Configure</p>
          <div className="flex flex-col gap-0.5">
            {configItems.map((item) => {
              const isActive = pathname.startsWith(item.href);
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  className={`flex items-center gap-3 rounded-2xl px-3 py-2.5 text-sm transition-colors ${
                    isActive
                      ? "bg-[var(--moss)] text-white shadow-[0_0_0_1px_rgba(144,50,61,0.35)]"
                      : "text-[var(--muted)] hover:bg-[var(--sage)] hover:text-[var(--foreground)]"
                  }`}
                >
                  <span className="shrink-0">{item.icon}</span>
                  <span>{item.label}</span>
                </Link>
              );
            })}
          </div>
        </div>

        <div className="mt-6 rounded-[18px] border border-[var(--line)] bg-[rgba(255,255,255,0.02)] px-3 py-3">
          <p className="eyebrow text-[9px] text-[var(--muted)]">Operating lens</p>
          <p className="mt-2 text-xs leading-5 text-[var(--muted)]">
            Keep the workspace fast, compact, and connected. Surface context where work happens.
          </p>
        </div>
      </nav>

      <div className="mt-auto shrink-0 border-t border-[var(--line)] px-4 py-4">
        <div className="flex items-center gap-2.5">
          <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-[var(--moss)] text-[11px] font-semibold text-white">
            {initials}
          </div>
          <div className="min-w-0 flex-1">
            <p className="truncate text-xs font-medium">{displayName}</p>
            <p className="truncate text-[10px] text-[var(--muted)]">{user?.email ?? "Not signed in"}</p>
          </div>
          {/* Sign out */}
          <button
            onClick={handleSignOut}
            title="Sign out"
            className="shrink-0 rounded-lg p-1 text-[var(--muted)] hover:bg-[var(--sage)] hover:text-[var(--foreground)] transition-colors"
          >
            <svg width="14" height="14" viewBox="0 0 14 14" fill="none" aria-hidden="true">
              <path d="M5.5 2H3a1 1 0 00-1 1v8a1 1 0 001 1h2.5" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" />
              <path d="M9.5 9.5L12 7l-2.5-2.5M12 7H5.5" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          </button>
        </div>
      </div>
    </aside>
  );
}
