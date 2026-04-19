import type { Metadata } from "next";
import { ContactsShell } from "@/components/contacts/contacts-shell";
import { getContacts } from "@/lib/supabase/queries";

export const metadata: Metadata = { title: "Contacts — Work Hat" };

type ContactsPageProps = {
  searchParams: Promise<{ view?: string }>;
};

export default async function ContactsPage({ searchParams }: ContactsPageProps) {
  const { view } = await searchParams;
  const contacts = await getContacts(view);
  return <ContactsShell contacts={contacts} activeView={view} />;
}
