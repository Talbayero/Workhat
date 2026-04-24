/**
 * Inbox and queue data access.
 * This module is the domain boundary for conversations, queue health, and
 * inbox-specific supporting data.
 */

export type { QueueFilters, QueueHealth } from "@/lib/supabase/queries";

export {
  getConversationById,
  getConversations,
  getConversationsForCompany,
  getConversationsForContact,
  getOrgIntentColors,
  getQAQueueFromDB,
  getQueueHealth,
} from "@/lib/supabase/queries";
