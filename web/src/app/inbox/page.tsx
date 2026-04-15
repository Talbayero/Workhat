import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { InboxWorkspace } from "@/components/inbox/inbox-workspace";
import type { InboxViewId } from "@/lib/mock-data";

type Props = {
  searchParams: Promise<{ view?: string }>;
};

export default async function InboxPage({ searchParams }: Props) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login?next=/inbox");

  const { data: appUser } = await supabase
    .from("users")
    .select("id")
    .eq("auth_user_id", user.id)
    .single();

  if (!appUser) redirect("/onboarding");

  const { view } = await searchParams;
  return <InboxWorkspace activeView={(view as InboxViewId) ?? "all"} />;
}
