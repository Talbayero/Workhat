import { ContactsShell } from "@/components/contacts/contacts-shell";

type ContactPageProps = {
  params: Promise<{ contactId: string }>;
  searchParams: Promise<{ view?: string }>;
};

export default async function ContactPage({ params, searchParams }: ContactPageProps) {
  const { contactId } = await params;
  const { view } = await searchParams;

  return <ContactsShell selectedContactId={contactId} activeView={view} />;
}
