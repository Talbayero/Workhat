import { NextRequest, NextResponse } from "next/server";
import { after } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { fetchWithCircuitBreaker } from "@/lib/security/circuit-breaker";

/* ─────────────────────────────────────────────
   POST /api/waitlist
   Public route — no auth required.

   Body: { email: string, role?: string }

   1. Inserts into waitlist_signups (idempotent on email)
   2. Sends notification email to teddyalbayero@work-hat.com via Resend
      (requires RESEND_API_KEY env var — skips gracefully if missing)
───────────────────────────────────────────── */

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function escapeHtml(value: string) {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

export async function POST(req: NextRequest) {
  let body: Record<string, unknown>;
  try {
    const parsed = await req.json();
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
      return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
    }
    body = parsed as Record<string, unknown>;
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  if (typeof body.email !== "string") {
    return NextResponse.json({ error: "Valid email is required." }, { status: 400 });
  }
  if (body.role != null && typeof body.role !== "string") {
    return NextResponse.json({ error: "Role must be text." }, { status: 400 });
  }

  const email = body.email.trim().toLowerCase();
  if (!EMAIL_RE.test(email)) {
    return NextResponse.json({ error: "Valid email is required." }, { status: 400 });
  }

  const role = (body.role ?? "").trim().slice(0, 120);

  // ── 1. Persist to Supabase ────────────────────────────────────────────────
  let supabase: ReturnType<typeof createAdminClient>;
  try {
    supabase = createAdminClient();
  } catch (err) {
    const message = err instanceof Error ? err.message : "Admin client unavailable";
    console.error("[waitlist] admin client init failed:", message);
    return NextResponse.json({ error: "Waitlist is temporarily unavailable." }, { status: 503 });
  }

  const { data: existing, error: existingError } = await supabase
    .from("waitlist_signups")
    .select("id")
    .eq("email", email)
    .maybeSingle();

  if (existingError) {
    return NextResponse.json({ error: "Failed to check waitlist. Please try again." }, { status: 500 });
  }

  if (existing) {
    // Already on the list — treat as success (idempotent)
    return NextResponse.json({ message: "Already on the waitlist." });
  }

  const { error: insertErr } = await supabase
    .from("waitlist_signups")
    .insert({
      email,
      role: role || null,
      source: req.headers.get("referer") ?? "direct",
      ip_address: req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? null,
    });

  if (insertErr) {
    // Duplicate — handle race condition
    if (insertErr.code === "23505") {
      return NextResponse.json({ message: "Already on the waitlist." });
    }
    console.error("[waitlist] Insert error:", insertErr.message);
    return NextResponse.json({ error: "Failed to save. Please try again." }, { status: 500 });
  }

  // ── 2. Email notification (fire-and-forget) ───────────────────────────────
  const resendKey = process.env.RESEND_API_KEY;
  if (resendKey) {
    after(async () => {
      try {
        await fetchWithCircuitBreaker("https://api.resend.com/emails", {
          method: "POST",
          headers: {
            Authorization: `Bearer ${resendKey}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            from: "Work Hat <notifications@work-hat.com>",
            to: ["teddyalbayero@work-hat.com"],
            subject: `New waitlist signup: ${email}`,
            html: `
              <div style="font-family: system-ui, sans-serif; max-width: 480px;">
                <h2 style="margin: 0 0 16px;">New waitlist signup</h2>
                <table style="width: 100%; border-collapse: collapse;">
                  <tr>
                    <td style="padding: 8px 0; color: #888; width: 80px;">Email</td>
                    <td style="padding: 8px 0; font-weight: 600;">${escapeHtml(email)}</td>
                  </tr>
                  ${role ? `<tr><td style="padding: 8px 0; color: #888;">Role</td><td style="padding: 8px 0;">${escapeHtml(role)}</td></tr>` : ""}
                  <tr>
                    <td style="padding: 8px 0; color: #888;">Time</td>
                    <td style="padding: 8px 0;">${new Date().toUTCString()}</td>
                  </tr>
                </table>
                <p style="margin-top: 24px; color: #666; font-size: 13px;">
                  Sent from work-hat.com waitlist form.
                </p>
              </div>
            `,
          }),
        }, { key: "resend-waitlist-notification", timeoutMs: 15_000 });
      } catch (err) {
        console.error("[waitlist] Resend notification failed:", err);
      }
    });
  }

  return NextResponse.json({ message: "You're on the list." }, { status: 201 });
}
