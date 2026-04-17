"use client";

import { useEffect, useState } from "react";

export function SearchShell({ isDemo = false, baseDir = "" }: { isDemo?: boolean; baseDir?: string }) {
  return (
    <div className="flex h-full items-center justify-center p-8">
      <div className="max-w-xl text-center">
        <h2 className="text-2xl font-semibold">Search</h2>
        <p className="mt-3 text-[var(--muted)]">
          Search across conversations, contacts, and knowledge entries.
        </p>
        <div className="mt-6">
          <input
            type="search"
            placeholder="Search everything..."
            className="w-full rounded-[14px] border border-[var(--line)] bg-[var(--panel-strong)] px-4 py-3 outline-none focus:border-[var(--moss)]"
          />
        </div>
      </div>
    </div>
  );
}
