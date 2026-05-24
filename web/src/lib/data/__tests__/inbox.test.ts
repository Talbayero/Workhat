jest.mock("@/lib/supabase/server", () => ({
  createClient: jest.fn(),
}));

jest.mock("@/lib/supabase/admin", () => ({
  createOptionalAdminClient: jest.fn(() => ({ client: null, reason: "not configured" })),
}));

import { getConversations } from "@/lib/data/inbox";
import { createClient } from "@/lib/supabase/server";

type Row = Record<string, unknown>;
type Tables = Record<string, Row[]>;

class QueryBuilder {
  private filters: Array<(row: Row) => boolean> = [];

  constructor(private readonly rows: Row[]) {}

  select() {
    return this;
  }

  eq(column: string, value: unknown) {
    this.filters.push((row) => row[column] === value);
    return this;
  }

  in(column: string, values: unknown[]) {
    this.filters.push((row) => values.includes(row[column]));
    return this;
  }

  order() {
    return this;
  }

  async single() {
    return {
      data: this.rows.find((row) => this.filters.every((filter) => filter(row))) ?? null,
      error: null,
    };
  }

  then(resolve: (value: { data: Row[]; error: null }) => unknown, reject: (reason?: unknown) => unknown) {
    const rows = this.rows.filter((row) => this.filters.every((filter) => filter(row)));
    return Promise.resolve({ data: rows, error: null }).then(resolve, reject);
  }
}

function createDb(tables: Tables) {
  return {
    auth: {
      getUser: jest.fn(async () => ({
        data: { user: { id: "auth-user-1", email: "agent@work-hat.com" } },
      })),
    },
    from(table: string) {
      return new QueryBuilder(tables[table] ?? []);
    },
  };
}

describe("inbox data loader", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it("returns Gmail-imported conversations for the current org", async () => {
    jest.mocked(createClient).mockResolvedValue(createDb({
      users: [{ id: "user-1", auth_user_id: "auth-user-1", org_id: "org-1" }],
      conversations: [
        {
          id: "conversation-1",
          org_id: "org-1",
          subject: "Gmail OAuth Setup",
          status: "open",
          priority: "normal",
          contact_id: "contact-1",
          company_id: "company-1",
          assigned_to_name: "",
          assigned_user_id: null,
          risk_level: null,
          ai_confidence: null,
          preview: "Imported Gmail preview",
          intent: null,
          tags: [],
          last_message_at: "2026-05-24T12:00:00.000Z",
          sla_status: "on_track",
          sla_target: "first_response",
          sla_due_at: null,
          sla_breached_at: null,
          sla_last_evaluated_at: "2026-05-24T12:00:00.000Z",
          contacts: {
            full_name: "Customer One",
            email: "customer@example.com",
            phone: "",
            tier: "",
            notes: "",
            tags: [],
          },
          companies: { name: "Clean Method" },
          channels: { type: "email" },
        },
        {
          id: "conversation-2",
          org_id: "org-2",
          subject: "Other org",
        },
      ],
    }) as never);

    const conversations = await getConversations();

    expect(conversations).toHaveLength(1);
    expect(conversations[0]).toMatchObject({
      id: "conversation-1",
      subject: "Gmail OAuth Setup",
      preview: "Imported Gmail preview",
      customerName: "Customer One",
      companyName: "Clean Method",
      channel: "email",
    });
  });
});
