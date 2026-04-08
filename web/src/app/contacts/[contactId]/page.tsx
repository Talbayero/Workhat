import { notFound } from "next/navigation";
import { ContactsShell } from "@/components/contacts/contacts-shell";
import {
  getContacts,
  getContactById,
  getCompanyById,
  getConversationsForContact,
} from "@/lib/supabase/queries";

type ContactPageProps = {
  params: Promise<{ contactId: string }>;
  searchParams: Promise<{ view?: string }>;
};

export default async function ContactPage({ params, searchParams }: ContactPageProps) {
  const { contactId } = await params;
  const { view } = await searchParams;

  const [contacts, selectedContact, linkedConversations] = await Promise.all([
    getContacts(view),
    getContactById(contactId),
    getConversationsForContact(contactId),
  ]);

  if (!selectedContact) notFound();

  const company = selectedContact.companyId
    ? await getCompanyById(selectedContact.companyId)
    : null;

  return (
    <ContactsShell
      contacts={contacts}
      selectedContact={selectedContact}
      linkedConversations={linkedConversations}
      company={company}
      activeView={view}
    />
  );
}
