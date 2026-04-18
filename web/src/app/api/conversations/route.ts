import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { classifyIntent as classifyIntentFromDb, routeBySkill } from "@/lib/ai/intent-classifier";
import { createAdminClient } from "@/lib/supabase/admin";

/* ─────────────────────────────────────────────
   POST /api/conversations
   Creates a conversation manually — used for
   testing and for outbound-initiated threads.

   Body:
   {
     contactEmail: string      // finds or creates contact
     contactName?: string
     subject: string
     firstMessage: string      // body of the opening inbound message
     intent?: string           // defaults to "general"
   }
───────────────────────────────────────────── */

async function getAppUser() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return null;
  const { data, error } = await supabase
    .from("users")
    .select("id, org_id, full_name")
    .eq("auth_user_id", user.id)
    .maybeSingle();

  if (error) {
    console.error("[conversations] app user lookup failed:", error.message);
    return null;
  }

  return data as { id: string; org_id: string; full_name: string } | null;
}

const GENERIC_DOMAINS = new Set([
  "gmail.com", "yahoo.com", "hotmail.com", "outlook.com",
  "icloud.com", "me.com", "aol.com", "protonmail.com", "live.com",
]);

function normalizeOptionalString(value: unknown) {
  if (value == null) return null;
  if (typeof value !== "string") return undefined;
  return value.trim() || null;
}

export async function POST(req: NextRequest) {
  const appUser = await getAppUser();
  if (!appUser) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  let body: Record<string, unknown>;
  try {
    const parsed = await req.json();
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
      return NextResponse.json({ error: "Invalid JSON payload." }, { status: 400 });
    }
    body = parsed as Record<string, unknown>;
  } catch {
    return NextResponse.json({ error: "Invalid JSON payload." }, { status: 400 });
  }

  const contactEmailRaw = normalizeOptionalString(body.contactEmail);
  const contactName = normalizeOptionalString(body.contactName);
  const subject = normalizeOptionalString(body.subject);
  const firstMessage = normalizeOptionalString(body.firstMessage);
  const explicitIntent = normalizeOptionalString(body.intent);

  if (contactEmailRaw === undefined) return NextResponse.json({ error: "Contact email must be text." }, { status: 400 });
  if (contactName === undefined) return NextResponse.json({ error: "Contact name must be text." }, { status: 400 });
  if (subject === undefined) return NextResponse.json({ error: "Subject must be text." }, { status: 400 });
  if (firstMessage === undefined) return NextResponse.json({ error: "Message body must be text." }, { status: 400 });
  if (explicitIntent === undefined) return NextResponse.json({ error: "Intent must be text." }, { status: 400 });

  const contactEmail = contactEmailRaw?.toLowerCase();
  if (!contactEmail || !contactEmail.includes("@")) {
    return NextResponse.json({ error: "Valid contact email is required." }, { status: 400 });
  }
  if (!subject) return NextResponse.json({ error: "Subject is required." }, { status: 400 });
  if (!firstMessage) return NextResponse.json({ error: "Message body is required." }, { status: 400 });

  const supabase = await createClient();
  let admin: ReturnType<typeof createAdminClient>;
  try {
    admin = createAdminClient();
  } catch (error) {
    console.error("[conversations] admin client unavailable:", error);
    return NextResponse.json(
      { error: "Conversation creation is unavailable because admin database access is not configured." },
      { status: 503 }
    );
  }
  const { org_id: orgId } = appUser;

  // Classify intent: use DB-driven classifier unless caller provided an explicit override
  let intent = explicitIntent?.toLowerCase() || "";
  if (!intent) {
    try {
      intent = await classifyIntentFromDb(orgId, subject, firstMessage);
    } catch {
      intent = "unclassified";
    }
  }

  // Routing: look up the intent's required skill and find the best agent
  let assignedToName = "";
  try {
    const { data: intentRow } = await admin
      .from("intents")
      .select("skill_required, name")
      .eq("org_id", orgId)
      .ilike("name", intent)
      .limit(1)
      .maybeSingle();

    if (intentRow?.skill_required) {
      const assignedUserId = await routeBySkill(orgId, intentRow.skill_required);
      if (assignedUserId) {
        const { data: agentRow } = await admin
          .from("users")
          .select("full_name")
          .eq("id", assignedUserId)
          .eq("org_id", orgId)
          .maybeSingle();
        assignedToName = agentRow?.full_name ?? "";
      }
    }
  } catch {
    // Routing is best-effort — don't fail conversation creation
  }

  // 1. Find or create contact
  let contactId: string;
  const { data: existingContact, error: existingContactError } = await supabase
    .from("contacts")
    .select("id")
    .eq("org_id", orgId)
    .eq("email", contactEmail)
    .maybeSingle();

  if (existingContactError) {
    console.error("[conversations] contact lookup failed:", existingContactError.message);
    return NextResponse.json({ error: "Failed to look up contact." }, { status: 500 });
  }

  if (existingContact) {
    contactId = existingContact.id;
    const { error: contactUpdateErr } = await supabase
      .from("contacts")
      .update({ last_activity_at: new Date().toISOString() })
      .eq("id", contactId)
      .eq("org_id", orgId);

    if (contactUpdateErr) {
      return NextResponse.json({ error: contactUpdateErr.message }, { status: 500 });
    }
  } else {
    const rawName = contactName || contactEmail.split("@")[0];
    const [firstName, ...rest] = rawName.split(" ");
    const { data: newContact, error: contactErr } = await supabase
      .from("contacts")
      .insert({
        org_id: orgId,
        first_name: firstName,
        last_name: rest.join(" ") || "",
        full_name: rawName,
        email: contactEmail,
        status: "active",
        last_activity_at: new Date().toISOString(),
      })
      .select("id")
      .single();

    if (contactErr || !newContact) {
      return NextResponse.json({ error: "Failed to create contact." }, { status: 500 });
    }
    contactId = newContact.id;
  }

  // 2. Find or create company from domain
  let companyId: string | null = null;
  const domain = contactEmail.split("@")[1];
  if (domain && !GENERIC_DOMAINS.has(domain)) {
    const { data: existingCompany, error: existingCompanyError } = await supabase
      .from("companies")
      .select("id")
      .eq("org_id", orgId)
      .eq("domain", domain)
      .maybeSingle();

    if (existingCompanyError) {
      console.error("[conversations] company lookup failed:", existingCompanyError.message);
      return NextResponse.json({ error: "Failed to look up company." }, { status: 500 });
    }

    if (existingCompany) {
      companyId = existingCompany.id;
    } else {
      const companyName = domain.split(".")[0].replace(/-/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
      const { data: newCompany, error: companyErr } = await supabase
        .from("companies")
        .insert({ org_id: orgId, name: companyName, domain, tier: "standard", active_contacts: 0, open_conversations: 0 })
        .select("id")
        .single();

      if (companyErr) {
        return NextResponse.json({ error: companyErr.message }, { status: 500 });
      }

      companyId = newCompany?.id ?? null;
    }

    if (companyId) {
      const { error: companyLinkErr } = await supabase
        .from("contacts")
        .update({ company_id: companyId })
        .eq("id", contactId)
        .eq("org_id", orgId)
        .is("company_id", null);

      if (companyLinkErr) {
        return NextResponse.json({ error: companyLinkErr.message }, { status: 500 });
      }
    }
  }

  // 3. Get the org's default email channel
  const { data: channel, error: channelError } = await supabase
    .from("channels")
    .select("id")
    .eq("org_id", orgId)
    .eq("type", "email")
    .maybeSingle();

  if (channelError) {
    console.error("[conversations] channel lookup failed:", channelError.message);
    return NextResponse.json({ error: "Failed to look up email channel." }, { status: 500 });
  }

  if (!channel) {
    return NextResponse.json({ error: "No email channel found. Complete onboarding first." }, { status: 400 });
  }

  // 4. Create conversation
  const preview = firstMessage.replace(/\s+/g, " ").trim().slice(0, 160);
  const { data: conversation, error: convErr } = await supabase
    .from("conversations")
    .insert({
      org_id: orgId,
      contact_id: contactId,
      company_id: companyId,
      channel_id: channel.id,
      subject,
      status: "open",
      priority: "normal",
      risk_level: "green",
      ai_confidence: "yellow",
      intent,
      preview,
      assigned_to_name: assignedToName,
      last_message_at: new Date().toISOString(),
    })
    .select("id")
    .single();

  if (convErr || !conversation) {
    return NextResponse.json({ error: "Failed to create conversation." }, { status: 500 });
  }

  const conversationId = conversation.id;

  // 5. Create the opening inbound message
  const messageAuthorName = contactName || contactEmail.split("@")[0];
  const { error: messageErr } = await supabase.from("messages").insert({
    org_id: orgId,
    conversation_id: conversationId,
    sender_type: "customer",
    direction: "inbound",
    author_name: messageAuthorName,
    body_text: firstMessage,
    is_note: false,
    metadata_json: { created_manually: true, created_by: appUser.id },
  });

  if (messageErr) {
    return NextResponse.json({ error: messageErr.message }, { status: 500 });
  }

  return NextResponse.json({ conversationId, contactId, companyId }, { status: 201 });
}
