import { ContactsShell } from "@/components/contacts/contacts-shell";
import { contacts } from "@/lib/mock-data";

export default async function DemoContactsPage() {
  return (
    <ContactsShell
      contacts={contacts}
      isDemo={true}
      baseDir="/demo"
    />
  );
}
