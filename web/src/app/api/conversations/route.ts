import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

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
  const { data } = await supabase
    .from("users")
    .select("id, org_id, full_name")
    .eq("auth_user_id", user.id)
    .single();
  return data as { id: string; org_id: string; full_name: string } | null;
}

const GENERIC_DOMAINS = new Set([
  "gmail.com", "yahoo.com", "hotmail.com", "outlook.com",
  "icloud.com", "me.com", "aol.com", "protonmail.com", "live.com",
]);

export async function POST(req: NextRequest) {
  const appUser = await getAppUser();
  if (!appUser) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = await req.json() as {
    contactEmail?: string;
    contactName?: string;
    subject?: string;
    firstMessage?: string;
    intent?: string;
  };

  const contactEmail = body.contactEmail?.trim().toLowerCase();
  const subject = body.subject?.trim();
  const firstMessage = body.firstMessage?.trim();

  if (!contactEmail || !contactEmail.includes("@")) {
    return NextResponse.json({ error: "Valid contact email is required." }, { status: 400 });
  }
  if (!subject) return NextResponse.json({ error: "Subject is required." }, { status: 400 });
  if (!firstMessage) return NextResponse.json({ error: "Message body is required." }, { status: 400 });

  const supabase = await createClient();
  const { org_id: orgId } = appUser;
  const intent = body.intent?.trim() || "general";

  // 1. Find or create contact
  let contactId: string;
  const { data: existingContact } = await supabase
    .from("contacts")
    .select("id")
    .eq("org_id", orgId)
    .eq("email", contactEmail)
    .single();

  if (existingContact) {
    contactId = existingContact.id;
    await supabase.from("contacts").update({ last_activity_at: new Date().toISOString() }).eq("id", contactId);
  } else {
    const rawName = body.contactName?.trim() || contactEmail.split("@")[0];
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
    const { data: existingCompany } = await supabase
      .from("companies")
      .select("id")
      .eq("org_id", orgId)
      .eq("domain", domain)
      .single();

    if (existingCompany) {
      companyId = existingCompany.id;
    } else {
      const companyName = domain.split(".")[0].replace(/-/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
      const { data: newCompany } = await supabase
        .from("companies")
        .insert({ org_id: orgId, name: companyName, domain, tier: "standard", active_contacts: 0, open_conversations: 0 })
        .select("id")
        .single();
      companyId = newCompany?.id ?? null;
    }

    if (companyId) {
      await supabase.from("contacts").update({ company_id: companyId }).eq("id", contactId).is("company_id", null);
    }
  }

  // 3. Get the org's default email channel
  const { data: channel } = await supabase
    .from("channels")
    .select("id")
    .eq("org_id", orgId)
    .eq("type", "email")
    .single();

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
      assigned_to_name: "",
      last_message_at: new Date().toISOString(),
    })
    .select("id")
    .single();

  if (convErr || !conversation) {
    return NextResponse.json({ error: "Failed to create conversation." }, { status: 500 });
  }

  const conversationId = conversation.id;

  // 5. Create the opening inbound message
  const contactName = body.contactName?.trim() || contactEmail.split("@")[0];
  await supabase.from("messages").insert({
    org_id: orgId,
    conversation_id: conversationId,
    sender_type: "customer",
    direction: "inbound",
    author_name: contactName,
    body_text: firstMessage,
    is_note: false,
    metadata_json: { created_manually: true, created_by: appUser.id },
  });

  return NextResponse.json({ conversationId, contactId, companyId }, { status: 201 });
}
