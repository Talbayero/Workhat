import { NextResponse } from "next/server";
import { createOptionalAdminClient } from "@/lib/supabase/admin";
import type { CurrentAppUser } from "@/lib/auth/app-user";

export const CAPABILITIES = [
  "conversations.read",
  "conversations.reply",
  "conversations.assign",
  "records.manage",
  "ai.generate",
  "ai.configure",
  "knowledge.read",
  "knowledge.edit",
  "qa.review",
  "settings.manage",
  "billing.manage",
  "integrations.manage",
  "team.manage",
  "team.invite",
  "team.skills.manage",
  "audit.read",
] as const;

export type Capability = (typeof CAPABILITIES)[number];

export const ROLE_CAPABILITY_PRESETS: Record<string, readonly Capability[]> = {
  admin: CAPABILITIES,
  manager: [
    "conversations.read",
    "conversations.reply",
    "conversations.assign",
    "records.manage",
    "ai.generate",
    "ai.configure",
    "knowledge.read",
    "knowledge.edit",
    "qa.review",
    "billing.manage",
    "integrations.manage",
    "team.invite",
    "team.skills.manage",
    "audit.read",
  ],
  agent: [
    "conversations.read",
    "conversations.reply",
    "ai.generate",
    "knowledge.read",
  ],
  qa_reviewer: [
    "conversations.read",
    "knowledge.read",
    "qa.review",
  ],
};

type CapabilityOverrideRow = {
  capability: string;
  effect: "grant" | "revoke";
};

function isCapability(value: string): value is Capability {
  return (CAPABILITIES as readonly string[]).includes(value);
}

function presetCapabilitiesForRole(role: string) {
  return new Set(ROLE_CAPABILITY_PRESETS[role] ?? []);
}

async function getMappedCapabilities(user: CurrentAppUser, label: string) {
  const adminState = createOptionalAdminClient();
  if (!adminState.client) {
    console.warn(`[${label}] capability DB lookup unavailable:`, adminState.reason);
    return presetCapabilitiesForRole(user.role);
  }

  const { data: roleRows, error: roleError } = await adminState.client
    .from("role_capabilities")
    .select("capability")
    .eq("role", user.role);

  if (roleError) {
    console.warn(`[${label}] role capability lookup failed; falling back to role preset:`, roleError.message);
    return presetCapabilitiesForRole(user.role);
  }

  const capabilities = new Set<Capability>();
  for (const row of roleRows ?? []) {
    const capability = (row as { capability?: string }).capability;
    if (capability && isCapability(capability)) capabilities.add(capability);
  }

  const { data: overrideRows, error: overrideError } = await adminState.client
    .from("user_capability_overrides")
    .select("capability, effect")
    .eq("org_id", user.org_id)
    .eq("user_id", user.id);

  if (overrideError) {
    console.warn(`[${label}] capability override lookup failed; using role capabilities only:`, overrideError.message);
    return capabilities;
  }

  for (const row of (overrideRows ?? []) as CapabilityOverrideRow[]) {
    if (!isCapability(row.capability)) continue;
    if (row.effect === "grant") capabilities.add(row.capability);
    if (row.effect === "revoke") capabilities.delete(row.capability);
  }

  return capabilities;
}

export async function hasCapability(
  user: CurrentAppUser,
  capability: Capability,
  label = "authorization"
) {
  const capabilities = await getMappedCapabilities(user, label);
  return capabilities.has(capability);
}

export async function hasAnyCapability(
  user: CurrentAppUser,
  capabilities: readonly Capability[],
  label = "authorization"
) {
  const granted = await getMappedCapabilities(user, label);
  return capabilities.some((capability) => granted.has(capability));
}

export async function requireCapability(
  user: CurrentAppUser,
  capability: Capability,
  label = "authorization"
) {
  if (await hasCapability(user, capability, label)) return null;
  return NextResponse.json({ error: "Insufficient permissions." }, { status: 403 });
}

export async function requireAnyCapability(
  user: CurrentAppUser,
  capabilities: readonly Capability[],
  label = "authorization"
) {
  if (await hasAnyCapability(user, capabilities, label)) return null;
  return NextResponse.json({ error: "Insufficient permissions." }, { status: 403 });
}
