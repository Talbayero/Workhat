import { ContactsShell } from "@/components/contacts/contacts-shell";
import { contacts } from "@/lib/mock-data";
import { notFound } from "next/navigation";

export default async function DemoContactDetailPage({ params }: { params: { id: string } }) {
  const contact = contacts.find((c) => c.id === params.id);
  
  if (!contact) {
    notFound();
  }

  return (
    <ContactsShell
      contacts={contacts}
      selectedContact={contact}
      isDemo={true}
      baseDir="/demo"
    />
  );
}
