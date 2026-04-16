import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";

export const dynamic = "force-dynamic";

async function search(q: string, orgId: string) {
  const supabase = await createClient();
  const pattern = `%${q}%`;

  const [convRes, contactRes, companyRes] = await Promise.all([
    supabase
      .from("conversations")
      .select("id, subject, preview, status, last_message_at, contacts(full_name)")
      .eq("org_id", orgId)
      .or(`subject.ilike.${pattern},preview.ilike.${pattern}`)
      .order("last_message_at", { ascending: false })
      .limit(10),
    supabase
      .from("contacts")
      .select("id, full_name, email, tier, status")
      .eq("org_id", orgId)
      .or(`full_name.ilike.${pattern},email.ilike.${pattern}`)
      .order("last_activity_at", { ascending: false })
      .limit(10),
    supabase
      .from("companies")
      .select("id, name, domain, industry, tier")
      .eq("org_id", orgId)
      .or(`name.ilike.${pattern},domain.ilike.${pattern}`)
      .order("name", { ascending: true })
      .limit(10),
  ]);

  type RawConv = {
    id: string; subject: string; preview: string; status: string;
    contacts: { full_name: string }[] | { full_name: string } | null;
  };

  return {
    conversations: (convRes.data ?? []) as unknown as RawConv[],
    contacts: (contactRes.data ?? []) as {
      id: string; full_name: string; email: string | null; tier: string; status: string;
    }[],
    companies: (companyRes.data ?? []) as {
      id: string; name: string; domain: string | null; industry: string | null; tier: string;
    }[],
  };
}

export default async function SearchPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string }>;
}) {
  const { q = "" } = await searchParams;

  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { data: appUser } = await supabase
    .from("users")
    .select("org_id")
    .eq("auth_user_id", user.id)
    .single();

  if (!appUser) redirect("/login");

  const trimmed = q.trim();
  const results = trimmed
    ? await search(trimmed, (appUser as { org_id: string }).org_id)
    : { conversations: [], contacts: [], companies: [] };

  const total = results.conversations.length + results.contacts.length + results.companies.length;

  return (
    <div className="mx-auto max-w-3xl px-6 py-10 space-y-8">
      <div>
        <p className="eyebrow text-[10px] text-[var(--muted)]">Workspace / Search</p>
        <h1 className="mt-1 text-2xl font-semibold">
          {trimmed ? `Results for "${trimmed}"` : "Search"}
        </h1>
        {trimmed && (
          <p className="mt-1 text-sm text-[var(--muted)]">
            {total === 0 ? "No matches found." : `${total} result${total !== 1 ? "s" : ""} across conversations, contacts, and companies`}
          </p>
        )}
      </div>

      {results.conversations.length > 0 && (
        <section>
          <p className="eyebrow text-[10px] text-[var(--muted)] mb-3">Conversations</p>
          <div className="space-y-2">
            {results.conversations.map((c) => (
              <Link
                key={c.id}
                href={`/inbox/${c.id}`}
                className="block rounded-[16px] border border-[var(--line)] bg-[var(--panel-strong)] p-4 transition-colors hover:border-[var(--line-strong)]"
              >
                <div className="flex items-start justify-between gap-3">
                  <p className="text-sm font-medium">{c.subject}</p>
                  <span className="shrink-0 rounded-full border border-[var(--line)] px-2.5 py-1 text-[10px] capitalize">{c.status.replace(/_/g, " ")}</span>
                </div>
                {c.contacts && (
                  <p className="mt-0.5 text-xs text-[var(--muted)]">
                    {Array.isArray(c.contacts) ? c.contacts[0]?.full_name : c.contacts.full_name}
                  </p>
                )}
                <p className="mt-1.5 line-clamp-1 text-xs text-[var(--muted)]">{c.preview}</p>
              </Link>
            ))}
          </div>
        </section>
      )}

      {results.contacts.length > 0 && (
        <section>
          <p className="eyebrow text-[10px] text-[var(--muted)] mb-3">Contacts</p>
          <div className="space-y-2">
            {results.contacts.map((c) => (
              <Link
                key={c.id}
                href={`/contacts/${c.id}`}
                className="block rounded-[16px] border border-[var(--line)] bg-[var(--panel-strong)] p-4 transition-colors hover:border-[var(--line-strong)]"
              >
                <p className="text-sm font-medium">{c.full_name}</p>
                <p className="mt-0.5 text-xs text-[var(--muted)]">{c.email ?? "—"}</p>
              </Link>
            ))}
          </div>
        </section>
      )}

      {results.companies.length > 0 && (
        <section>
          <p className="eyebrow text-[10px] text-[var(--muted)] mb-3">Companies</p>
          <div className="space-y-2">
            {results.companies.map((c) => (
              <Link
                key={c.id}
                href={`/companies/${c.id}`}
                className="block rounded-[16px] border border-[var(--line)] bg-[var(--panel-strong)] p-4 transition-colors hover:border-[var(--line-strong)]"
              >
                <p className="text-sm font-medium">{c.name}</p>
                <p className="mt-0.5 text-xs text-[var(--muted)]">{c.domain ?? c.industry ?? "—"}</p>
              </Link>
            ))}
          </div>
        </section>
      )}

      {trimmed && total === 0 && (
        <div className="rounded-[20px] border border-[var(--line)] bg-[var(--panel-strong)] p-8 text-center">
          <p className="text-sm text-[var(--muted)]">No conversations, contacts, or companies matched <strong>{trimmed}</strong>.</p>
          <p className="mt-2 text-xs text-[var(--muted)]">Try a different search term or browse from the sidebar.</p>
        </div>
      )}

      {!trimmed && (
        <div className="rounded-[20px] border border-[var(--line)] bg-[var(--panel-strong)] p-8 text-center">
          <p className="text-sm text-[var(--muted)]">Enter a search term in the box above to find records, threads, and knowledge.</p>
        </div>
      )}
    </div>
  );
}
