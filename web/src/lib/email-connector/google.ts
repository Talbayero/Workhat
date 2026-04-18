import { NextRequest } from "next/server";
import { fetchWithCircuitBreaker } from "@/lib/security/circuit-breaker";

export const GMAIL_PROVIDER = "gmail" as const;

export const GMAIL_SCOPES = [
  "https://www.googleapis.com/auth/gmail.readonly",
  "https://www.googleapis.com/auth/gmail.send",
];

type TokenResponse = {
  access_token: string;
  refresh_token?: string;
  expires_in: number;
  scope?: string;
  token_type: string;
};

export type GmailProfile = {
  emailAddress: string;
  messagesTotal?: number;
  threadsTotal?: number;
  historyId?: string;
};

export type GmailMessageListItem = {
  id: string;
  threadId: string;
};

export type GmailListMessagesResponse = {
  messages?: GmailMessageListItem[];
  nextPageToken?: string;
  resultSizeEstimate?: number;
};

export type GmailMessage = {
  id: string;
  threadId: string;
  labelIds?: string[];
  snippet?: string;
  historyId?: string;
  internalDate?: string;
  payload?: {
    mimeType?: string;
    filename?: string;
    headers?: { name: string; value: string }[];
    body?: { data?: string };
    parts?: GmailMessage["payload"][];
  };
};

export type GmailSendResponse = {
  id: string;
  threadId: string;
  labelIds?: string[];
};

export type GmailWatchResponse = {
  historyId: string;
  expiration: string;
};

export type GmailHistoryResponse = {
  history?: Array<{
    id: string;
    messagesAdded?: Array<{
      message?: GmailMessageListItem;
    }>;
  }>;
  historyId?: string;
  nextPageToken?: string;
};

export function getAppBaseUrl(req: NextRequest) {
  return (
    process.env.NEXT_PUBLIC_APP_URL ||
    `${req.nextUrl.protocol}//${req.nextUrl.host}`
  ).replace(/\/$/, "");
}

export function getGoogleRedirectUri(req: NextRequest) {
  return `${getAppBaseUrl(req)}/api/email/gmail/callback`;
}

export function assertGoogleOAuthConfig() {
  const clientId = process.env.GOOGLE_CLIENT_ID;
  const clientSecret = process.env.GOOGLE_CLIENT_SECRET;

  if (!clientId || !clientSecret) {
    throw new Error(
      "Gmail connector is not configured yet. Add GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET in Vercel, then redeploy."
    );
  }

  return { clientId, clientSecret };
}

export function buildGmailAuthUrl({
  redirectUri,
  state,
}: {
  redirectUri: string;
  state: string;
}) {
  const { clientId } = assertGoogleOAuthConfig();
  const params = new URLSearchParams({
    client_id: clientId,
    redirect_uri: redirectUri,
    response_type: "code",
    scope: GMAIL_SCOPES.join(" "),
    access_type: "offline",
    include_granted_scopes: "true",
    prompt: "consent",
    state,
  });

  return `https://accounts.google.com/o/oauth2/v2/auth?${params.toString()}`;
}

export async function exchangeGmailCode({
  code,
  redirectUri,
}: {
  code: string;
  redirectUri: string;
}) {
  const { clientId, clientSecret } = assertGoogleOAuthConfig();
  const response = await fetchWithCircuitBreaker("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      code,
      client_id: clientId,
      client_secret: clientSecret,
      redirect_uri: redirectUri,
      grant_type: "authorization_code",
    }),
  }, { key: "google-oauth-token" });

  if (!response.ok) {
    const body = await response.text();
    throw new Error(`Google token exchange failed: ${body}`);
  }

  return (await response.json()) as TokenResponse;
}

export async function refreshGmailAccessToken(refreshToken: string) {
  const { clientId, clientSecret } = assertGoogleOAuthConfig();
  const response = await fetchWithCircuitBreaker("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id: clientId,
      client_secret: clientSecret,
      refresh_token: refreshToken,
      grant_type: "refresh_token",
    }),
  }, { key: "google-oauth-refresh" });

  if (!response.ok) {
    const body = await response.text();
    throw new Error(`Google token refresh failed: ${body}`);
  }

  return (await response.json()) as Omit<TokenResponse, "refresh_token">;
}

export async function fetchGmailProfile(accessToken: string) {
  const response = await fetchWithCircuitBreaker("https://gmail.googleapis.com/gmail/v1/users/me/profile", {
    headers: { Authorization: `Bearer ${accessToken}` },
  }, { key: "gmail-profile" });

  if (!response.ok) {
    const body = await response.text();
    throw new Error(`Gmail profile fetch failed: ${body}`);
  }

  return (await response.json()) as GmailProfile;
}

export async function listGmailInboxMessages({
  accessToken,
  maxResults = 10,
}: {
  accessToken: string;
  maxResults?: number;
}) {
  const params = new URLSearchParams({
    maxResults: String(maxResults),
    q: "in:inbox newer_than:30d",
  });
  const response = await fetchWithCircuitBreaker(
    `https://gmail.googleapis.com/gmail/v1/users/me/messages?${params.toString()}`,
    { headers: { Authorization: `Bearer ${accessToken}` } },
    { key: "gmail-list-messages" }
  );

  if (!response.ok) {
    const body = await response.text();
    throw new Error(`Gmail message list failed: ${body}`);
  }

  return (await response.json()) as GmailListMessagesResponse;
}

export async function fetchGmailMessage(accessToken: string, messageId: string) {
  const params = new URLSearchParams({ format: "full" });
  const response = await fetchWithCircuitBreaker(
    `https://gmail.googleapis.com/gmail/v1/users/me/messages/${messageId}?${params.toString()}`,
    { headers: { Authorization: `Bearer ${accessToken}` } },
    { key: "gmail-fetch-message" }
  );

  if (!response.ok) {
    const body = await response.text();
    throw new Error(`Gmail message fetch failed: ${body}`);
  }

  return (await response.json()) as GmailMessage;
}

export async function sendGmailMessage({
  accessToken,
  raw,
  threadId,
}: {
  accessToken: string;
  raw: string;
  threadId?: string | null;
}) {
  const response = await fetchWithCircuitBreaker("https://gmail.googleapis.com/gmail/v1/users/me/messages/send", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      raw,
      ...(threadId ? { threadId } : {}),
    }),
  }, { key: "gmail-send-message", timeoutMs: 20_000 });

  if (!response.ok) {
    const body = await response.text();
    throw new Error(`Gmail send failed: ${body}`);
  }

  return (await response.json()) as GmailSendResponse;
}

export async function listGmailHistory({
  accessToken,
  startHistoryId,
  pageToken,
}: {
  accessToken: string;
  startHistoryId: string;
  pageToken?: string;
}) {
  const params = new URLSearchParams({
    startHistoryId,
    labelId: "INBOX",
  });
  params.append("historyTypes", "messageAdded");
  if (pageToken) params.set("pageToken", pageToken);

  const response = await fetchWithCircuitBreaker(
    `https://gmail.googleapis.com/gmail/v1/users/me/history?${params.toString()}`,
    { headers: { Authorization: `Bearer ${accessToken}` } },
    { key: "gmail-history" }
  );

  if (!response.ok) {
    const body = await response.text();
    throw new Error(`Gmail history sync failed: ${body}`);
  }

  return (await response.json()) as GmailHistoryResponse;
}

export async function watchGmailInbox({
  accessToken,
  topicName,
}: {
  accessToken: string;
  topicName: string;
}) {
  const response = await fetchWithCircuitBreaker("https://gmail.googleapis.com/gmail/v1/users/me/watch", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      topicName,
      labelIds: ["INBOX"],
      labelFilterBehavior: "include",
    }),
  }, { key: "gmail-watch", timeoutMs: 20_000 });

  if (!response.ok) {
    const body = await response.text();
    throw new Error(`Gmail watch registration failed: ${body}`);
  }

  return (await response.json()) as GmailWatchResponse;
}

export function tokenExpiryDate(expiresInSeconds: number) {
  return new Date(Date.now() + Math.max(expiresInSeconds - 60, 60) * 1000);
}
