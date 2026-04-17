import { after, NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { classifyIntent as classifyIntentFromDb, routeBySkill } from "@/lib/ai/intent-classifier";

/* ─────────────────────────────────────────────
   POST /api/inbound/email
   Postmark inbound webhook — receives parsed
   inbound email and creates/threads conversations.

   Setup in Postmark:
     Inbound domain: inbound.work-hat.com (MX record)
     Webhook URL: https://work-hat.com/api/inbound/email

   Optional auth: set POSTMARK_INBOUND_TOKEN env var,
   then add to Postmark webhook headers as X-Inbound-Token.
───────────────────────────────────────────── */

// Postmark inbound payload shape (fields we use)
interface PostmarkPayload {
  From: string;
  FromFull: { Email: string; Name: string; MailboxHash: string };
  To: string;
  ToFull: { Email: string; Name: string; MailboxHash: string }[];
  Subject: string;
  TextBody: string;
  HtmlBody?: string;
  MessageID: string;
  InReplyTo?: string;
  ReplyTo?: string;
  Date: string;
  Tag?: string;
  Headers?: { Name: string; Value: string }[];
}

// ── Intent classification ────────────────────────────────────────────────────
// Hardcoded fallback used only when no org context is available yet (step 1).
// Once orgId is resolved, we use the DB-driven classifier.

function classifyIntentFallback(subject: string, body: string): string {
  const t = `${subject} ${body}`.toLowerCase();
  if (/invoice|payment|charge|refund|bill|subscription|cancel|pricing|receipt|overcharg/.test(t))
    return "billing";
  if (/urgent|asap|critical|down|broken|error|bug|issue|problem|help|not working|crash|fail/.test(t))
    return "support";
  if (/escalat|manager|unacceptable|terrible|worst|legal|lawsuit|complaint/.test(t))
    return "escalation";
  if (/feature|suggest|would.*nice|can you add|request|idea|improvement/.test(t))
    return "feature_request";
  if (/getting started|onboard|setup|how.*do|new user|tutorial|access|sign.?up/.test(t))
    return "onboarding";
  return "unclassified";
}

function scoreRisk(subject: string, body: string): "green" | "yellow" | "red" {
  const t = `${subject} ${body}`.toLowerCase();
  if (/urgent|legal|lawsuit|chargeback|fraud|cancel.*account|escalat|unacceptable|terrible|manager/.test(t))
    return "red";
  if (/frustrated|not working|disappointed|broken|delay|overcharge|disappoint|slow|bad/.test(t))
    return "yellow";
  return "green";
}

function buildPreview(text: string, maxLen = 160): string {
  return text.replace(/\s+/g, " ").trim().slice(0, maxLen);
}

// Strip quoted reply text from body (common "On <date> <name> wrote:" pattern)
function stripQuotedReply(text: string): string {
  const lines = text.split("\n");
  const cutoff = lines.findIndex(
    (l) =>
      /^On .* wrote:/.test(l.trim()) ||
      l.trim().startsWith(">") ||
      /^-{3,}/.test(l.trim())
  );
  return (cutoff > 0 ? lines.slice(0, cutoff) : lines).join("\n").trim();
}

// ── Route handler ────────────────────────────────────────────────────────────

export async function POST(req: NextRequest) {
  // Optional token auth
  const inboundToken = process.env.POSTMARK_INBOUND_TOKEN;
  if (inboundToken) {
    const reqToken = req.headers.get("x-inbound-token");
    if (reqToken !== inboundToken) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
  }

  let payload: PostmarkPayload;
  try {
    payload = (await req.json()) as PostmarkPayload;
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const supabase = createAdminClient();

  // ── 1. Find org from destination email ──────────────────────────────────
  // Destination format: inbound+{slug}@work-hat.com
  // Postmark gives us the hash after + as MailboxHash
  const mailboxHash = payload.ToFull?.[0]?.MailboxHash?.trim();
  const toEmail = payload.ToFull?.[0]?.Email?.toLowerCase() ?? payload.To?.toLowerCase();

  // Build the full inbound address to look up
  const inboundAddress = mailboxHash
    ? `inbound+${mailboxHash}@work-hat.com`
    : toEmail;

  if (!inboundAddress) {
    console.warn("[inbound] Missing destination address");
    return NextResponse.json({ ok: true, skipped: "missing_destination" });
  }

  const { data: channel, error: channelErr } = await supabase
    .from("channels")
    .select("id, org_id")
    .eq("inbound_address", inboundAddress)
    .maybeSingle();

  if (channelErr) {
    console.error("[inbound] Channel lookup error:", channelErr.message);
    return NextResponse.json({ error: "Failed to resolve inbound channel" }, { status: 500 });
  }

  if (!channel) {
    // Unknown destination — still return 200 so Postmark doesn't retry
    console.warn(`[inbound] No channel found for address: ${inboundAddress}`);
    return NextResponse.json({ ok: true, skipped: "unknown_destination" });
  }

  const orgId: string = channel.org_id;
  const channelId: string = channel.id;

  // ── 2. Idempotency check ─────────────────────────────────────────────────
  const { data: existing, error: existingErr } = await supabase
    .from("messages")
    .select("id, conversation_id")
    .eq("org_id", orgId)
    .eq("channel_message_id", payload.MessageID)
    .maybeSingle();

  if (existingErr) {
    console.error("[inbound] Idempotency lookup error:", existingErr.message);
    return NextResponse.json({ error: "Failed to check duplicate message" }, { status: 500 });
  }

  if (existing) {
    return NextResponse.json({ ok: true, skipped: "duplicate", messageId: existing.id });
  }

  // ── 3. Find or create contact ────────────────────────────────────────────
  const senderEmail = payload.FromFull?.Email?.toLowerCase() ?? payload.From?.toLowerCase();
  if (!senderEmail || !senderEmail.includes("@")) {
    return NextResponse.json({ error: "Sender email is required" }, { status: 400 });
  }

  const senderName = payload.FromFull?.Name?.trim() || senderEmail.split("@")[0];
  const [firstName, ...restName] = senderName.split(" ");
  const lastName = restName.join(" ");

  let contactId: string | null = null;

  const { data: existingContact, error: existingContactErr } = await supabase
    .from("contacts")
    .select("id")
    .eq("org_id", orgId)
    .eq("email", senderEmail)
    .maybeSingle();

  if (existingContactErr) {
    console.error("[inbound] Contact lookup error:", existingContactErr.message);
    return NextResponse.json({ error: "Failed to find contact" }, { status: 500 });
  }

  if (existingContact) {
    contactId = existingContact.id;
    // Bump last_activity_at
    const { error: contactUpdateErr } = await supabase
      .from("contacts")
      .update({ last_activity_at: new Date().toISOString() })
      .eq("id", contactId)
      .eq("org_id", orgId);

    if (contactUpdateErr) {
      console.error("[inbound] Contact update error:", contactUpdateErr.message);
      return NextResponse.json({ error: "Failed to update contact" }, { status: 500 });
    }
  } else {
    const { data: newContact, error: contactInsertErr } = await supabase
      .from("contacts")
      .insert({
        org_id: orgId,
        first_name: firstName || senderName,
        last_name: lastName || "",
        full_name: senderName,
        email: senderEmail,
        status: "active",
        last_activity_at: new Date().toISOString(),
      })
      .select("id")
      .single();

    if (contactInsertErr || !newContact) {
      console.error("[inbound] Contact insert error:", contactInsertErr?.message);
      return NextResponse.json({ error: "Failed to create contact" }, { status: 500 });
    }

    contactId = newContact?.id ?? null;
  }

  // ── 4. Find or create company from sender domain ─────────────────────────
  const senderDomain = senderEmail.split("@")[1] ?? "";
  let companyId: string | null = null;

  // Skip personal email providers — they're not companies
  const genericDomains = new Set([
    "gmail.com", "yahoo.com", "hotmail.com", "outlook.com",
    "icloud.com", "me.com", "aol.com", "protonmail.com", "live.com",
  ]);

  if (senderDomain && !genericDomains.has(senderDomain)) {
    const { data: existingCompany, error: existingCompanyErr } = await supabase
      .from("companies")
      .select("id")
      .eq("org_id", orgId)
      .eq("domain", senderDomain)
      .maybeSingle();

    if (existingCompanyErr) {
      console.error("[inbound] Company lookup error:", existingCompanyErr.message);
      return NextResponse.json({ error: "Failed to find company" }, { status: 500 });
    }

    if (existingCompany) {
      companyId = existingCompany.id;
    } else {
      const companyName = senderDomain
        .split(".")[0]
        .replace(/-/g, " ")
        .replace(/\b\w/g, (c) => c.toUpperCase());

      const { data: newCompany, error: companyInsertErr } = await supabase
        .from("companies")
        .insert({
          org_id: orgId,
          name: companyName,
          domain: senderDomain,
          tier: "standard",
          open_conversations: 0,
          active_contacts: 0,
        })
        .select("id")
        .single();

      if (companyInsertErr || !newCompany) {
        console.error("[inbound] Company insert error:", companyInsertErr?.message);
        return NextResponse.json({ error: "Failed to create company" }, { status: 500 });
      }

      companyId = newCompany?.id ?? null;
    }

    // Link contact to company if not already linked
    if (contactId && companyId) {
      const { error: contactCompanyErr } = await supabase
        .from("contacts")
        .update({ company_id: companyId })
        .eq("id", contactId)
        .eq("org_id", orgId)
        .is("company_id", null);

      if (contactCompanyErr) {
        console.error("[inbound] Contact company link error:", contactCompanyErr.message);
        return NextResponse.json({ error: "Failed to link contact to company" }, { status: 500 });
      }
    }
  }

  // ── 5. Thread matching ───────────────────────────────────────────────────
  // Check In-Reply-To header to find an existing conversation
  let conversationId: string | null = null;

  if (payload.InReplyTo) {
    const { data: threadMsg, error: threadErr } = await supabase
      .from("messages")
      .select("conversation_id")
      .eq("org_id", orgId)
      .eq("channel_message_id", payload.InReplyTo)
      .maybeSingle();

    if (threadErr) {
      console.error("[inbound] Thread lookup error:", threadErr.message);
      return NextResponse.json({ error: "Failed to match reply thread" }, { status: 500 });
    }

    conversationId = threadMsg?.conversation_id ?? null;
  }

  // ── 6. Classify intent and risk ─────────────────────────────────────────
  const cleanBody = stripQuotedReply(payload.TextBody ?? "");

  // Try DB-driven classifier first; fall back to hardcoded regex if it fails
  let intent: string;
  try {
    intent = await classifyIntentFromDb(orgId, payload.Subject ?? "", cleanBody);
    // If no DB intents configured yet, fall back to regex rules
    if (intent === "unclassified") {
      const fallback = classifyIntentFallback(payload.Subject ?? "", cleanBody);
      if (fallback !== "unclassified") intent = fallback;
    }
  } catch {
    intent = classifyIntentFallback(payload.Subject ?? "", cleanBody);
  }
  const riskLevel = scoreRisk(payload.Subject ?? "", cleanBody);
  const preview = buildPreview(cleanBody || (payload.TextBody ?? ""));

  // ── 6b. Skill-based routing ──────────────────────────────────────────────
  let assignedToName = "";
  if (intent !== "unclassified") {
    try {
      const { data: intentRows } = await supabase
        .from("intents")
        .select("skill_required")
        .eq("org_id", orgId)
        .ilike("name", intent)
        .limit(1);

      const skillRequired = intentRows?.[0]?.skill_required ?? null;
      if (skillRequired) {
        const assignedUserId = await routeBySkill(orgId, skillRequired);
        if (assignedUserId) {
          const { data: agentRow } = await supabase
            .from("users")
            .select("full_name")
            .eq("id", assignedUserId)
            .eq("org_id", orgId)
            .maybeSingle();
          assignedToName = agentRow?.full_name ?? "";
        }
      }
    } catch (err) {
      console.warn("[inbound] Routing failed (non-fatal):", err instanceof Error ? err.message : err);
    }
  }

  // ── 7. Create conversation if no thread match ────────────────────────────
  if (!conversationId) {
    const { data: newConv, error: conversationErr } = await supabase
      .from("conversations")
      .insert({
        org_id: orgId,
        contact_id: contactId,
        company_id: companyId,
        channel_id: channelId,
        subject: payload.Subject?.trim() || "(no subject)",
        status: "open",
        priority: riskLevel === "red" ? "urgent" : "normal",
        risk_level: riskLevel,
        ai_confidence: "yellow",
        intent,
        preview,
        assigned_to_name: assignedToName,
        last_message_at: new Date().toISOString(),
        external_thread_id: payload.MessageID,
      })
      .select("id")
      .single();

    if (conversationErr || !newConv) {
      console.error("[inbound] Conversation insert error:", conversationErr?.message);
      return NextResponse.json({ error: "Failed to create conversation" }, { status: 500 });
    }

    conversationId = newConv?.id ?? null;
  } else {
    // Update existing conversation with latest preview + risk
    const { error: conversationUpdateErr } = await supabase
      .from("conversations")
      .update({
        preview,
        last_message_at: new Date().toISOString(),
        // Escalate risk if higher — never downgrade automatically
        ...(riskLevel === "red" ? { risk_level: "red" } : {}),
        ...(riskLevel === "yellow" ? {} : {}),
      })
      .eq("id", conversationId)
      .eq("org_id", orgId);

    if (conversationUpdateErr) {
      console.error("[inbound] Conversation update error:", conversationUpdateErr.message);
      return NextResponse.json({ error: "Failed to update conversation" }, { status: 500 });
    }
  }

  if (!conversationId) {
    console.error("[inbound] Failed to create conversation");
    return NextResponse.json({ error: "Failed to create conversation" }, { status: 500 });
  }

  // ── 8. Create message ────────────────────────────────────────────────────
  const { data: message, error: msgErr } = await supabase
    .from("messages")
    .insert({
      org_id: orgId,
      conversation_id: conversationId,
      sender_type: "customer",
      direction: "inbound",
      channel_message_id: payload.MessageID,
      author_name: senderName,
      subject: payload.Subject?.trim() || null,
      body_text: cleanBody || payload.TextBody || "",
      body_html: payload.HtmlBody || null,
      is_note: false,
      metadata_json: {
        from_email: senderEmail,
        reply_to: payload.ReplyTo || null,
        in_reply_to: payload.InReplyTo || null,
        postmark_date: payload.Date,
      },
    })
    .select("id")
    .single();

  if (msgErr) {
    console.error("[inbound] Message insert error:", msgErr.message);
    return NextResponse.json({ error: "Failed to create message" }, { status: 500 });
  }

  // ── 9. Update company open conversation count ────────────────────────────
  if (companyId && !payload.InReplyTo) {
    // Only increment on new conversations, not threaded replies
    after(async () => {
      const { error } = await supabase.rpc("increment_company_open_conversations", {
        p_company_id: companyId,
      });

      if (error) {
        console.warn("[inbound] Company open count increment failed:", error.message);
      }
    });
  }

  console.log(
    `[inbound] Created message ${message!.id} on conversation ${conversationId} ` +
    `(org: ${orgId}, intent: ${intent}, risk: ${riskLevel})`
  );

  return NextResponse.json({
    ok: true,
    conversationId,
    messageId: message!.id,
    contactId,
    companyId,
    intent,
    riskLevel,
  });
}
