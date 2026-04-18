import { NextRequest, NextResponse } from "next/server";
import { getCurrentAppUser } from "@/lib/auth/app-user";
import { createClient } from "@/lib/supabase/server";

/* ─────────────────────────────────────────────
   PATCH  /api/contacts/:id — update contact
   DELETE /api/contacts/:id — delete contact
───────────────────────────────────────────── */

const CONTACT_STATUSES = new Set(["active", "watch", "vip"]);
const CONTACT_TIERS = new Set(["standard", "pro", "enterprise", "vip"]);
const LIFECYCLE_STAGES = new Set(["lead", "prospect", "customer", "churned"]);
const PREFERRED_CHANNELS = new Set(["email", "sms", "phone", "chat"]);
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function normalizeOptionalString(value: unknown) {
  if (value == null) return null;
  if (typeof value !== "string") return undefined;
  return value.trim() || null;
}

function normalizeTags(value: unknown) {
  if (value == null) return [];
  if (!Array.isArray(value) || value.some((tag) => typeof tag !== "string")) {
    return null;
  }

  return [...new Set(value.map((tag) => tag.trim()).filter(Boolean))];
}

async function refreshCompanyContactCount(
  supabase: Awaited<ReturnType<typeof createClient>>,
  orgId: string,
  companyId: string | null
) {
  if (!companyId) return;

  const { count, error: countError } = await supabase
    .from("contacts")
    .select("id", { count: "exact", head: true })
    .eq("org_id", orgId)
    .eq("company_id", companyId);

  if (countError) {
    console.error("[contacts/:id] company contact count failed:", countError.message);
    return;
  }

  const { error: updateError } = await supabase
    .from("companies")
    .update({ active_contacts: count ?? 0 })
    .eq("id", companyId)
    .eq("org_id", orgId);

  if (updateError) {
    console.error("[contacts/:id] company contact count update failed:", updateError.message);
  }
}

type RouteContext = { params: Promise<{ contactId: string }> };

export async function PATCH(req: NextRequest, ctx: RouteContext) {
  const { contactId } = await ctx.params;
  if (!contactId?.trim()) {
    return NextResponse.json({ error: "contactId is required." }, { status: 400 });
  }

  const appUser = await getCurrentAppUser({ label: "contacts/:id" });
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

  const supabase = await createClient();

  const updates: Record<string, unknown> = {};
  let currentCompanyId: string | null = null;
  let nextCompanyId: string | null | undefined;

  for (const key of [
    "first_name",
    "last_name",
    "phone",
    "notes",
    "location",
  ] as const) {
    if (key in body) {
      const value = normalizeOptionalString(body[key]);
      if (value === undefined) return NextResponse.json({ error: `${key} must be text.` }, { status: 400 });
      updates[key] = value;
    }
  }

  if ("email" in body) {
    const email = normalizeOptionalString(body.email);
    if (email === undefined) return NextResponse.json({ error: "Email must be text." }, { status: 400 });
    if (email && !EMAIL_RE.test(email)) return NextResponse.json({ error: "Enter a valid email address." }, { status: 400 });
    updates.email = email?.toLowerCase() || null;
  }

  if ("tier" in body) {
    const tier = normalizeOptionalString(body.tier);
    if (tier === undefined) return NextResponse.json({ error: "Tier must be text." }, { status: 400 });
    if (tier && !CONTACT_TIERS.has(tier)) return NextResponse.json({ error: "Invalid contact tier." }, { status: 400 });
    updates.tier = tier;
  }

  if ("status" in body) {
    const status = normalizeOptionalString(body.status);
    if (!status || !CONTACT_STATUSES.has(status)) {
      return NextResponse.json({ error: "Invalid contact status." }, { status: 400 });
    }
    updates.status = status;
  }

  if ("preferred_channel" in body) {
    const preferredChannel = normalizeOptionalString(body.preferred_channel);
    if (preferredChannel === undefined) {
      return NextResponse.json({ error: "preferred_channel must be text." }, { status: 400 });
    }
    if (preferredChannel && !PREFERRED_CHANNELS.has(preferredChannel)) {
      return NextResponse.json({ error: "Invalid preferred channel." }, { status: 400 });
    }
    updates.preferred_channel = preferredChannel;
  }

  if ("lifecycle_stage" in body) {
    const lifecycleStage = normalizeOptionalString(body.lifecycle_stage);
    if (lifecycleStage === undefined) {
      return NextResponse.json({ error: "lifecycle_stage must be text." }, { status: 400 });
    }
    if (lifecycleStage && !LIFECYCLE_STAGES.has(lifecycleStage)) {
      return NextResponse.json({ error: "Invalid lifecycle stage." }, { status: 400 });
    }
    updates.lifecycle_stage = lifecycleStage;
  }

  if ("tags" in body) {
    const tags = normalizeTags(body.tags);
    if (tags === null) return NextResponse.json({ error: "Tags must be a list of text values." }, { status: 400 });
    updates.tags = tags;
  }

  if ("first_name" in updates || "last_name" in updates || "company_id" in body) {
    const { data: current, error: currentError } = await supabase
      .from("contacts")
      .select("first_name, last_name, company_id")
      .eq("id", contactId)
      .eq("org_id", appUser.org_id)
      .maybeSingle();

    if (currentError) {
      console.error("[contacts/:id] contact lookup failed:", currentError.message);
      return NextResponse.json({ error: "Unable to verify this contact." }, { status: 500 });
    }
    if (!current) return NextResponse.json({ error: "Contact not found for this workspace." }, { status: 404 });

    currentCompanyId = current.company_id ?? null;

    // Keep full_name in sync when either name field changes.
    const fn = (updates.first_name ?? current?.first_name ?? "") as string;
    const ln = (updates.last_name ?? current?.last_name ?? "") as string;
    updates.full_name = [fn, ln].filter(Boolean).join(" ") || "Unknown";
  }

  if ("company_id" in body) {
    const companyId = typeof body.company_id === "string" ? body.company_id.trim() : body.company_id;

    if (!companyId) {
      updates.company_id = null;
    } else if (typeof companyId === "string") {
      const { data: company, error: companyError } = await supabase
        .from("companies")
        .select("id")
        .eq("id", companyId)
        .eq("org_id", appUser.org_id)
        .maybeSingle();

      if (companyError) {
        console.error("[contacts/:id] company lookup failed:", companyError.message);
        return NextResponse.json({ error: "Unable to verify this company." }, { status: 500 });
      }

      if (!company) {
        return NextResponse.json({ error: "Company not found for this workspace." }, { status: 400 });
      }

      updates.company_id = companyId;
      nextCompanyId = companyId;
    } else {
      return NextResponse.json({ error: "Invalid company value." }, { status: 400 });
    }

    if (!companyId) nextCompanyId = null;
  }

  if (Object.keys(updates).length === 0) {
    return NextResponse.json({ error: "No fields to update." }, { status: 400 });
  }

  const { data, error } = await supabase
    .from("contacts")
    .update(updates)
    .eq("id", contactId)
    .eq("org_id", appUser.org_id)
    .select("id")
    .maybeSingle();

  if (error) {
    const status = error.code === "23505" ? 409 : 500;
    const message = error.code === "23505" ? "A contact with this email already exists." : "Unable to update this contact.";
    if (status === 500) console.error("[contacts/:id] contact update failed:", error.message);
    return NextResponse.json({ error: message }, { status });
  }

  if (!data) return NextResponse.json({ error: "Contact not found for this workspace." }, { status: 404 });

  if (nextCompanyId !== undefined && nextCompanyId !== currentCompanyId) {
    await refreshCompanyContactCount(supabase, appUser.org_id, currentCompanyId);
    await refreshCompanyContactCount(supabase, appUser.org_id, nextCompanyId);
  }

  return NextResponse.json({ ok: true });
}

export async function DELETE(_req: NextRequest, ctx: RouteContext) {
  const { contactId } = await ctx.params;
  if (!contactId?.trim()) {
    return NextResponse.json({ error: "contactId is required." }, { status: 400 });
  }

  const appUser = await getCurrentAppUser({ label: "contacts/:id" });
  if (!appUser) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  if (!["admin", "manager"].includes(appUser.role)) {
    return NextResponse.json({ error: "Insufficient permissions." }, { status: 403 });
  }

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("contacts")
    .delete()
    .eq("id", contactId)
    .eq("org_id", appUser.org_id)
    .select("id, company_id")
    .maybeSingle();

  if (error) {
    const status = error.code === "23503" ? 409 : 500;
    const message = error.code === "23503" ? "This contact is still linked to other records." : "Unable to delete this contact.";
    if (status === 500) console.error("[contacts/:id] contact delete failed:", error.message);
    return NextResponse.json({ error: message }, { status });
  }

  if (!data) return NextResponse.json({ error: "Contact not found for this workspace." }, { status: 404 });

  await refreshCompanyContactCount(supabase, appUser.org_id, data.company_id ?? null);

  return NextResponse.json({ ok: true });
}
