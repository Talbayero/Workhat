/**
 * Contact-facing data access.
 * Keep app/page imports pointed here instead of the legacy shared query file.
 */

export {
  getContactById,
  getContacts,
  getContactsForCompany,
} from "@/lib/supabase/queries";
