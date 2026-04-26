"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import type { CompanyRecord } from "@/lib/mock-data";
import type { ContextDefinition, ContextKnowledgeSummary, ContextObjectDetail } from "@/lib/context/types";
import { emptyContextDefinition } from "@/lib/context/types";

type TeamMember = {
  id: string;
  full_name: string;
  status: string;
  role: string;
};

type FormState = {
  title: string;
  description: string;
  category: string;
  companyId: string;
  ownerUserId: string;
  reviewerUserId: string;
  when_to_use: string;
  required_info: string;
  decision_rules: string;
  allowed_actions: string;
  prohibited_actions: string;
  escalation_rules: string;
  risk_flags: string;
  output_guidelines: string;
  tone_guidelines: string;
  known_gaps: string;
  success_metrics: string;
  knowledgeEntryIds: string[];
};

type ContextEditorProps = {
  mode: "create" | "edit";
  contextObject?: ContextObjectDetail | null;
  companies: Pick<CompanyRecord, "id" | "name">[];
  knowledgeEntries: ContextKnowledgeSummary[];
  canEdit: boolean;
  canPublish: boolean;
};

function linesToArray(value: string) {
  return value
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean);
}

function arrayToLines(value: string[]) {
  return value.join("\n");
}

function definitionToForm(definition: ContextDefinition): FormState {
  return {
    title: "",
    description: "",
    category: "general",
    companyId: "",
    ownerUserId: "",
    reviewerUserId: "",
    when_to_use: definition.when_to_use,
    required_info: arrayToLines(definition.required_info),
    decision_rules: arrayToLines(definition.decision_rules),
    allowed_actions: arrayToLines(definition.allowed_actions),
    prohibited_actions: arrayToLines(definition.prohibited_actions),
    escalation_rules: arrayToLines(definition.escalation_rules),
    risk_flags: arrayToLines(definition.risk_flags),
    output_guidelines: arrayToLines(definition.output_guidelines),
    tone_guidelines: arrayToLines(definition.tone_guidelines),
    known_gaps: arrayToLines(definition.known_gaps),
    success_metrics: arrayToLines(definition.success_metrics),
    knowledgeEntryIds: definition.knowledge_entry_ids,
  };
}

function buildInitialState(contextObject?: ContextObjectDetail | null): FormState {
  const definition = contextObject?.currentVersion?.context_definition_json ?? emptyContextDefinition();
  return {
    ...definitionToForm(definition),
    title: contextObject?.currentVersion?.title ?? contextObject?.title ?? "",
    description: contextObject?.currentVersion?.description ?? contextObject?.description ?? "",
    category: contextObject?.category ?? "general",
    companyId: contextObject?.companyId ?? "",
    ownerUserId: contextObject?.ownerUserId ?? "",
    reviewerUserId: contextObject?.reviewerUserId ?? "",
  };
}

function definitionFromState(form: FormState): ContextDefinition {
  return {
    when_to_use: form.when_to_use.trim(),
    required_info: linesToArray(form.required_info),
    decision_rules: linesToArray(form.decision_rules),
    allowed_actions: linesToArray(form.allowed_actions),
    prohibited_actions: linesToArray(form.prohibited_actions),
    escalation_rules: linesToArray(form.escalation_rules),
    risk_flags: linesToArray(form.risk_flags),
    output_guidelines: linesToArray(form.output_guidelines),
    tone_guidelines: linesToArray(form.tone_guidelines),
    known_gaps: linesToArray(form.known_gaps),
    success_metrics: linesToArray(form.success_metrics),
    knowledge_entry_ids: form.knowledgeEntryIds,
  };
}

function Field({
  label,
  hint,
  children,
}: {
  label: string;
  hint?: string;
  children: React.ReactNode;
}) {
  return (
    <div>
      <label className="eyebrow text-[10px] text-[var(--muted)]">{label}</label>
      {hint && <p className="mt-1 text-[11px] leading-5 text-[var(--muted)]">{hint}</p>}
      <div className="mt-1.5">{children}</div>
    </div>
  );
}

function textInputClass(disabled = false) {
  return `w-full rounded-[14px] border border-[var(--line)] bg-[var(--panel-strong)] px-4 py-2.5 text-sm text-[var(--foreground)] outline-none transition-colors focus:border-[var(--moss)] ${
    disabled ? "opacity-70" : ""
  }`;
}

export function ContextEditor({
  mode,
  contextObject,
  companies,
  knowledgeEntries,
  canEdit,
  canPublish,
}: ContextEditorProps) {
  const router = useRouter();
  const [form, setForm] = useState<FormState>(() => buildInitialState(contextObject));
  const [saving, setSaving] = useState(false);
  const [publishing, setPublishing] = useState(false);
  const [archiving, setArchiving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [teamMembers, setTeamMembers] = useState<TeamMember[]>([]);

  useEffect(() => {
    let cancelled = false;

    fetch("/api/settings/team")
      .then(async (response) => {
        const payload = await response.json().catch(() => ({})) as {
          members?: TeamMember[];
        };

        if (!response.ok) {
          throw new Error(payload && "error" in payload ? String((payload as { error?: string }).error ?? "Unable to load team members.") : "Unable to load team members.");
        }

        if (cancelled) return;
        setTeamMembers((payload.members ?? []).filter((member) => member.status !== "disabled"));
      })
      .catch((fetchError) => {
        if (!cancelled) {
          console.warn("[contexts] team member load failed:", fetchError instanceof Error ? fetchError.message : fetchError);
        }
      });

    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    setForm(buildInitialState(contextObject));
  }, [contextObject]);

  const canPublishCurrent = canPublish && mode === "edit" && !!contextObject?.currentVersionId;

  const selectedKnowledgeEntries = useMemo(
    () => new Set(form.knowledgeEntryIds),
    [form.knowledgeEntryIds]
  );

  function setField<K extends keyof FormState>(field: K, value: FormState[K]) {
    setForm((current) => ({ ...current, [field]: value }));
    setError(null);
  }

  function toggleKnowledgeEntry(id: string) {
    setField(
      "knowledgeEntryIds",
      selectedKnowledgeEntries.has(id)
        ? form.knowledgeEntryIds.filter((entryId) => entryId !== id)
        : [...form.knowledgeEntryIds, id]
    );
  }

  async function handleSave() {
    if (!canEdit) return;

    setSaving(true);
    setError(null);

    const payload = {
      title: form.title,
      description: form.description,
      category: form.category,
      companyId: form.companyId || null,
      ownerUserId: form.ownerUserId || null,
      reviewerUserId: form.reviewerUserId || null,
      contextDefinition: definitionFromState(form),
    };

    const url = mode === "create"
      ? "/api/context-objects"
      : `/api/context-objects/${contextObject?.id}`;
    const method = mode === "create" ? "POST" : "PATCH";

    try {
      const response = await fetch(url, {
        method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });

      const responseData = await response.json().catch(() => ({})) as {
        error?: string;
        contextId?: string;
      };

      if (!response.ok) {
        throw new Error(responseData.error ?? "Unable to save context.");
      }

      const targetContextId = mode === "create" ? responseData.contextId : contextObject?.id;
      if (targetContextId) {
        router.push(`/contexts/${targetContextId}`);
      } else {
        router.refresh();
      }
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : "Unable to save context.");
    } finally {
      setSaving(false);
    }
  }

  async function handlePublish() {
    if (!canPublishCurrent || !contextObject) return;

    setPublishing(true);
    setError(null);
    try {
      const response = await fetch(`/api/context-objects/${contextObject.id}/publish`, {
        method: "POST",
      });
      const payload = await response.json().catch(() => ({})) as { error?: string };
      if (!response.ok) {
        throw new Error(payload.error ?? "Unable to publish context.");
      }
      router.refresh();
    } catch (publishError) {
      setError(publishError instanceof Error ? publishError.message : "Unable to publish context.");
    } finally {
      setPublishing(false);
    }
  }

  async function handleArchive() {
    if (!canPublishCurrent || !contextObject) return;

    setArchiving(true);
    setError(null);
    try {
      const response = await fetch(`/api/context-objects/${contextObject.id}/archive`, {
        method: "POST",
      });
      const payload = await response.json().catch(() => ({})) as { error?: string };
      if (!response.ok) {
        throw new Error(payload.error ?? "Unable to archive context.");
      }
      router.refresh();
    } catch (archiveError) {
      setError(archiveError instanceof Error ? archiveError.message : "Unable to archive context.");
    } finally {
      setArchiving(false);
    }
  }

  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="shrink-0 border-b border-[var(--line)] px-5 py-5">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <p className="eyebrow text-[10px] text-[var(--muted)]">Operational context</p>
            <h1 className="mt-1 text-xl font-semibold">
              {mode === "create" ? "New context object" : form.title || "Context object"}
            </h1>
            <p className="mt-2 max-w-2xl text-sm leading-6 text-[var(--muted)]">
              Keep this specific, auditable, and operational. Published versions are what AI drafts should follow.
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            {canPublishCurrent && (
              <>
                <button
                  onClick={handlePublish}
                  disabled={publishing}
                  className="rounded-full border border-[rgba(22,163,74,0.35)] px-4 py-2 text-sm font-medium text-[rgba(22,163,74,0.92)] transition-colors hover:bg-[rgba(22,163,74,0.08)] disabled:opacity-50"
                >
                  {publishing ? "Publishing..." : "Publish active version"}
                </button>
                <button
                  onClick={handleArchive}
                  disabled={archiving}
                  className="rounded-full border border-[var(--line-strong)] px-4 py-2 text-sm font-medium transition-colors hover:border-[var(--moss)] disabled:opacity-50"
                >
                  {archiving ? "Archiving..." : "Archive"}
                </button>
              </>
            )}
            {canEdit && (
              <button
                onClick={handleSave}
                disabled={saving}
                className="rounded-full bg-[var(--moss)] px-4 py-2 text-sm font-medium text-white transition-opacity hover:opacity-90 disabled:opacity-50"
              >
                {saving ? "Saving..." : mode === "create" ? "Create context" : "Save new version"}
              </button>
            )}
          </div>
        </div>

        {contextObject && (
          <div className="mt-4 flex flex-wrap gap-2 text-xs">
            <span className="rounded-full border border-[var(--line)] px-2.5 py-1 capitalize">
              {contextObject.status}
            </span>
            {contextObject.activeVersionNumber !== null && (
              <span className="rounded-full border border-[rgba(22,163,74,0.35)] px-2.5 py-1 text-[rgba(22,163,74,0.92)]">
                Active v{contextObject.activeVersionNumber}
              </span>
            )}
            {contextObject.currentVersionNumber !== null && (
              <span className="rounded-full border border-[var(--line)] px-2.5 py-1">
                Working v{contextObject.currentVersionNumber}
              </span>
            )}
          </div>
        )}
      </div>

      <div className="grid min-h-0 flex-1 gap-0 xl:grid-cols-[minmax(0,1fr)_320px]">
        <div className="scroll-soft overflow-y-auto px-5 py-5">
          <div className="space-y-5 rounded-[24px] border border-[var(--line)] bg-[var(--panel-strong)] p-5">
            <Field label="Title">
              <input
                value={form.title}
                onChange={(event) => setField("title", event.target.value)}
                disabled={!canEdit}
                className={textInputClass(!canEdit)}
                placeholder="Returns escalation for VIP renewals"
              />
            </Field>

            <Field label="Description" hint="Short human description of what this context is for.">
              <textarea
                value={form.description}
                onChange={(event) => setField("description", event.target.value)}
                disabled={!canEdit}
                rows={3}
                className={textInputClass(!canEdit)}
                placeholder="Operational guidance for renewal-related refund conversations."
              />
            </Field>

            <div className="grid gap-4 md:grid-cols-2">
              <Field label="Category">
                <input
                  value={form.category}
                  onChange={(event) => setField("category", event.target.value)}
                  disabled={!canEdit}
                  className={textInputClass(!canEdit)}
                  placeholder="billing"
                />
              </Field>

              <Field label="Linked company" hint="Optional. Leave blank for org-wide context.">
                <select
                  value={form.companyId}
                  onChange={(event) => setField("companyId", event.target.value)}
                  disabled={!canEdit}
                  className={textInputClass(!canEdit)}
                >
                  <option value="">Org-wide</option>
                  {companies.map((company) => (
                    <option key={company.id} value={company.id}>
                      {company.name}
                    </option>
                  ))}
                </select>
              </Field>
            </div>

            <div className="grid gap-4 md:grid-cols-2">
              <Field label="Owner">
                <select
                  value={form.ownerUserId}
                  onChange={(event) => setField("ownerUserId", event.target.value)}
                  disabled={!canEdit}
                  className={textInputClass(!canEdit)}
                >
                  <option value="">Unassigned</option>
                  {teamMembers.map((member) => (
                    <option key={member.id} value={member.id}>
                      {member.full_name}
                    </option>
                  ))}
                </select>
              </Field>

              <Field label="Reviewer">
                <select
                  value={form.reviewerUserId}
                  onChange={(event) => setField("reviewerUserId", event.target.value)}
                  disabled={!canEdit}
                  className={textInputClass(!canEdit)}
                >
                  <option value="">Unassigned</option>
                  {teamMembers.map((member) => (
                    <option key={member.id} value={member.id}>
                      {member.full_name}
                    </option>
                  ))}
                </select>
              </Field>
            </div>

            <Field
              label="When to use"
              hint="Explain the scenario in plain language. This is the first thing the draft layer sees."
            >
              <textarea
                value={form.when_to_use}
                onChange={(event) => setField("when_to_use", event.target.value)}
                disabled={!canEdit}
                rows={3}
                className={textInputClass(!canEdit)}
              />
            </Field>

            <div className="grid gap-4 xl:grid-cols-2">
              {[
                ["required_info", "Required info"],
                ["decision_rules", "Decision rules"],
                ["allowed_actions", "Allowed actions"],
                ["prohibited_actions", "Prohibited actions"],
                ["escalation_rules", "Escalation rules"],
                ["risk_flags", "Risk flags"],
                ["output_guidelines", "Output guidelines"],
                ["tone_guidelines", "Tone guidelines"],
                ["known_gaps", "Known gaps"],
                ["success_metrics", "Success metrics"],
              ].map(([field, label]) => (
                <Field
                  key={field}
                  label={label}
                  hint="One item per line."
                >
                  <textarea
                    value={form[field as keyof FormState] as string}
                    onChange={(event) => setField(field as keyof FormState, event.target.value as never)}
                    disabled={!canEdit}
                    rows={5}
                    className={textInputClass(!canEdit)}
                  />
                </Field>
              ))}
            </div>

            <Field
              label="Linked knowledge entries"
              hint="Optional. These entries are included with the selected context during draft generation."
            >
              <div className="space-y-2 rounded-[16px] border border-[var(--line)] bg-[rgba(255,255,255,0.02)] p-3">
                {knowledgeEntries.length === 0 ? (
                  <p className="text-sm text-[var(--muted)]">No active knowledge entries available.</p>
                ) : (
                  knowledgeEntries.map((entry) => (
                    <label
                      key={entry.id}
                      className="flex items-start gap-3 rounded-[14px] border border-transparent px-3 py-2 hover:border-[var(--line)]"
                    >
                      <input
                        type="checkbox"
                        checked={selectedKnowledgeEntries.has(entry.id)}
                        disabled={!canEdit}
                        onChange={() => toggleKnowledgeEntry(entry.id)}
                        className="mt-1"
                      />
                      <div className="min-w-0">
                        <p className="text-sm font-medium">{entry.title}</p>
                        <p className="text-xs leading-5 text-[var(--muted)]">
                          {entry.summary || entry.category}
                        </p>
                      </div>
                    </label>
                  ))
                )}
              </div>
            </Field>

            {error && (
              <p className="rounded-[14px] border border-[rgba(144,50,61,0.35)] bg-[rgba(73,17,28,0.18)] px-4 py-3 text-sm leading-6">
                {error}
              </p>
            )}
          </div>
        </div>

        <aside className="scroll-soft border-l border-[var(--line)] overflow-y-auto px-4 py-5 space-y-4">
          <section className="rounded-[20px] border border-[var(--line)] bg-[var(--panel-strong)] p-4">
            <p className="eyebrow text-[9px] text-[var(--muted)]">Usage rules</p>
            <ul className="mt-3 space-y-2 text-sm leading-6 text-[var(--muted)]">
              <li>Human approval still gates every customer reply.</li>
              <li>Published versions remain stable for AI traceability.</li>
              <li>Use knowledge links for factual references instead of copying SOP text here.</li>
            </ul>
          </section>

          {contextObject && (
            <section className="rounded-[20px] border border-[var(--line)] bg-[var(--panel-strong)] p-4">
              <p className="eyebrow text-[9px] text-[var(--muted)]">Version history</p>
              <div className="mt-3 space-y-2">
                {contextObject.versions.map((version) => (
                  <div key={version.id} className="rounded-[14px] border border-[var(--line)] px-3 py-2.5">
                    <div className="flex items-center justify-between gap-2">
                      <p className="text-sm font-medium">v{version.version_number}</p>
                      {contextObject.activeVersionId === version.id && (
                        <span className="rounded-full border border-[rgba(22,163,74,0.35)] px-2 py-0.5 text-[10px] text-[rgba(22,163,74,0.92)]">
                          Active
                        </span>
                      )}
                    </div>
                    <p className="mt-1 text-xs leading-5 text-[var(--muted)]">
                      {new Date(version.created_at).toLocaleString()}
                    </p>
                  </div>
                ))}
              </div>
            </section>
          )}
        </aside>
      </div>
    </div>
  );
}
