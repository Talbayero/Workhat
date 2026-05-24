jest.mock("@/lib/auth/app-user", () => ({
  getCurrentAppUser: jest.fn(),
}));

jest.mock("@/lib/auth/capabilities", () => ({
  requireCapability: jest.fn(),
}));

jest.mock("@/lib/supabase/admin", () => ({
  createAdminClient: jest.fn(),
}));

import { GET as listEmailConnections } from "@/app/api/email/connections/route";
import { getCurrentAppUser } from "@/lib/auth/app-user";
import { requireCapability } from "@/lib/auth/capabilities";
import { createAdminClient } from "@/lib/supabase/admin";

describe("GET /api/email/connections", () => {
  afterEach(() => {
    jest.clearAllMocks();
  });

  it("returns only Gmail OAuth metadata for the MVP connection surface", async () => {
    jest.mocked(getCurrentAppUser).mockResolvedValue({
      id: "user-1",
      org_id: "org-1",
      role: "admin",
    } as never);
    jest.mocked(requireCapability).mockResolvedValue(null as never);

    const order = jest.fn(async () => ({
      data: [
        {
          id: "conn-1",
          provider: "gmail",
          connection_type: "oauth",
          provider_account_email: "support@example.com",
          status: "active",
        },
      ],
      error: null,
    }));
    const query: { eq: jest.Mock; order: jest.Mock } = {
      eq: jest.fn(),
      order,
    };
    query.eq.mockReturnValue(query);
    const select: jest.Mock = jest.fn(() => query);
    const from = jest.fn(() => ({ select }));
    jest.mocked(createAdminClient).mockReturnValue({ from } as never);

    const response = await listEmailConnections();
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(from).toHaveBeenCalledWith("email_connections");
    const selectedColumns = String(select.mock.calls[0]?.[0] ?? "");
    expect(selectedColumns).not.toContain("access_token_ciphertext");
    expect(selectedColumns).not.toContain("refresh_token_ciphertext");
    expect(selectedColumns).not.toContain("diagnostics_json");
    expect(selectedColumns).not.toContain("credential_metadata");
    expect(query.eq).toHaveBeenCalledWith("org_id", "org-1");
    expect(query.eq).toHaveBeenCalledWith("provider", "gmail");
    expect(query.eq).toHaveBeenCalledWith("connection_type", "oauth");
    expect(body.connections).toHaveLength(1);
  });
});
