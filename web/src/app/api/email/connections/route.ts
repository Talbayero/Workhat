import { NextRequest, NextResponse } from "next/server";
import { getCurrentAppUser } from "@/lib/auth/app-user";
import { createAdminClient } from "@/lib/supabase/admin";

export async function GET() {
  const appUser = await getCurrentAppUser({ label: "email/connections" });
  if (!appUser) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  let db: ReturnType<typeof createAdminClient>;
  try {
    db = createAdminClient();
  } catch (error) {
    console.error("[email/connections] admin client init failed:", error);
    return NextResponse.json({ error: "Email connector is unavailable." }, { status: 503 });
  }

  const { data, error } = await db
    .from("email_connections")
    .select(
      "id, provider, provider_account_email, display_name, status, sync_status, token_expires_at, last_history_id, watch_expires_at, last_sync_at, error_message, created_at, updated_at"
    )
    .eq("org_id", appUser.org_id)
    .order("created_at", { ascending: false });

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ connections: data ?? [] });
}

export async function DELETE(req: NextRequest) {
  const appUser = await getCurrentAppUser({ label: "email/connections" });
  if (!appUser) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  if (!["admin", "manager"].includes(appUser.role)) {
    return NextResponse.json({ error: "Only admins and managers can disconnect email accounts." }, { status: 403 });
  }

  const connectionId = req.nextUrl.searchParams.get("connectionId");
  if (!connectionId) {
    return NextResponse.json({ error: "connectionId is required" }, { status: 422 });
  }

  let db: ReturnType<typeof createAdminClient>;
  try {
    db = createAdminClient();
  } catch (error) {
    console.error("[email/connections] admin client init failed:", error);
    return NextResponse.json({ error: "Email connector is unavailable." }, { status: 503 });
  }

  const { data, error } = await db
    .from("email_connections")
    .update({
      access_token_ciphertext: null,
      error_message: null,
      provider_metadata: {
        disconnected_at: new Date().toISOString(),
        disconnected_by: appUser.id,
      },
      refresh_token_ciphertext: null,
      status: "disabled",
      sync_status: "idle",
      token_expires_at: null,
      watch_expires_at: null,
    })
    .eq("id", connectionId)
    .eq("org_id", appUser.org_id)
    .select("id")
    .maybeSingle();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  if (!data) {
    return NextResponse.json({ error: "Email connection not found for this workspace." }, { status: 404 });
  }

  return NextResponse.json({ ok: true });
}
