import { NextRequest, NextResponse } from "next/server";
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

export async function POST(req: NextRequest) {
  let body: { email?: string; role?: string };
  try {
    body = await req.json() as { email?: string; role?: string };
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const email = (body.email ?? "").trim().toLowerCase();
  if (!email || !email.includes("@")) {
    return NextResponse.json({ error: "Valid email is required." }, { status: 400 });
  }

  const role = (body.role ?? "").trim().slice(0, 120);

  // ── 1. Persist to Supabase ────────────────────────────────────────────────
  const supabase = createAdminClient();

  const { data: existing } = await supabase
    .from("waitlist_signups")
    .select("id")
    .eq("email", email)
    .single();

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
    fetchWithCircuitBreaker("https://api.resend.com/emails", {
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
                <td style="padding: 8px 0; font-weight: 600;">${email}</td>
              </tr>
              ${role ? `<tr><td style="padding: 8px 0; color: #888;">Role</td><td style="padding: 8px 0;">${role}</td></tr>` : ""}
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
    }, { key: "resend-waitlist-notification", timeoutMs: 15_000 }).catch((err) => {
      console.error("[waitlist] Resend notification failed:", err);
    });
  }

  return NextResponse.json({ message: "You're on the list." }, { status: 201 });
}
