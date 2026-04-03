import { ContactsShell } from "@/components/contacts/contacts-shell";

type ContactPageProps = {
  params: Promise<{
    contactId: string;
  }>;
};

export default async function ContactPage({ params }: ContactPageProps) {
  const { contactId } = await params;

  return <ContactsShell selectedContactId={contactId} />;
}
