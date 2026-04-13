"use client";

import { useState } from "react";

interface WaitlistFormProps {
  size?: "hero" | "section";
  placeholder?: string;
}

export function WaitlistForm({
  size = "section",
  placeholder = "you@company.com",
}: WaitlistFormProps) {
  const [email, setEmail] = useState("");
  const [role, setRole] = useState("");
  const [state, setState] = useState<"idle" | "loading" | "success" | "error">("idle");
  const [errorMsg, setErrorMsg] = useState("");

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!email.trim() || !email.includes("@")) {
      setErrorMsg("Enter a valid work email.");
      setState("error");
      return;
    }

    setState("loading");
    setErrorMsg("");

    try {
      const res = await fetch("/api/waitlist", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: email.trim(), role: role.trim() }),
      });

      if (res.ok) {
        setState("success");
        setEmail("");
        setRole("");
      } else {
        const data = await res.json() as { error?: string };
        if (data.error?.includes("already")) {
          setState("success"); // idempotent — already on list
        } else {
          setErrorMsg(data.error ?? "Something went wrong. Try again.");
          setState("error");
        }
      }
    } catch {
      setErrorMsg("Network error. Please try again.");
      setState("error");
    }
  }

  if (state === "success") {
    return (
      <div
        className={`flex items-center gap-3 rounded-full border border-[rgba(34,197,94,0.3)] bg-[rgba(34,197,94,0.08)] px-5 ${
          size === "hero" ? "py-4" : "py-3"
        }`}
      >
        <div className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-emerald-500/20">
          <svg width="10" height="10" viewBox="0 0 10 10" fill="none">
            <path d="M2 5l2 2 4-4" stroke="#22c55e" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        </div>
        <p className="text-sm text-[var(--foreground)]">
          You&apos;re on the list. We&apos;ll reach out within 24 hours.
        </p>
      </div>
    );
  }

  return (
    <form onSubmit={handleSubmit} className="w-full space-y-2">
      <div className={`flex gap-2 ${size === "hero" ? "flex-col sm:flex-row" : "flex-col sm:flex-row"}`}>
        <input
          type="email"
          value={email}
          onChange={(e) => { setEmail(e.target.value); if (state === "error") setState("idle"); }}
          placeholder={placeholder}
          required
          className={`flex-1 rounded-full border border-[var(--line)] bg-[var(--panel-strong)] text-sm text-[var(--foreground)] placeholder:text-[var(--muted)] outline-none transition-colors focus:border-[var(--moss)] ${
            size === "hero" ? "px-5 py-3.5" : "px-4 py-3"
          }`}
        />
        <button
          type="submit"
          disabled={state === "loading"}
          className={`shrink-0 rounded-full bg-[var(--moss)] font-medium text-white transition-opacity hover:opacity-90 disabled:opacity-50 disabled:cursor-not-allowed ${
            size === "hero" ? "px-7 py-3.5 text-base" : "px-6 py-3 text-sm"
          }`}
        >
          {state === "loading" ? "Joining…" : "Join the waitlist"}
        </button>
      </div>

      {state === "error" && errorMsg && (
        <p className="px-2 text-xs text-[rgba(220,80,80,0.9)]">{errorMsg}</p>
      )}
    </form>
  );
}
