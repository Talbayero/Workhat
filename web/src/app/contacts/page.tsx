import { ContactsShell } from "@/components/contacts/contacts-shell";

type ContactsPageProps = {
  searchParams: Promise<{ view?: string }>;
};

export default async function ContactsPage({ searchParams }: ContactsPageProps) {
  const { view } = await searchParams;
  return <ContactsShell activeView={view} />;
}
