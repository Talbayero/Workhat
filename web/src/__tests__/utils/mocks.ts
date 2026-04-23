/**
 * Mock utilities for testing
 * Provides factory functions for mocking Supabase clients, requests, etc.
 */

import type { NextRequest } from "next/server";
import type { SupabaseClient } from "@supabase/supabase-js";

/**
 * Mock NextRequest with common HTTP properties
 */
export function createMockNextRequest(overrides?: Partial<NextRequest>): NextRequest {
  const mockRequest = {
    url: "http://localhost:3000/api/test",
    nextUrl: new URL("http://localhost:3000/api/test"),
    method: "GET",
    headers: new Headers([
      ["content-type", "application/json"],
      ["user-agent", "Jest/TestClient"],
      ["x-forwarded-for", "192.168.1.1"],
    ]),
    cookies: {
      getAll: jest.fn(() => []),
      get: jest.fn(),
    },
    json: jest.fn(async () => ({})),
    ...overrides,
  };

  return mockRequest as unknown as NextRequest;
}

/**
 * Create a mock Supabase client with method mocks
 */
export function createMockSupabaseClient(): jest.Mocked<SupabaseClient> {
  return {
    from: jest.fn((table: string) => ({
      select: jest.fn().mockReturnThis(),
      insert: jest.fn().mockResolvedValue({ data: null, error: null }),
      update: jest.fn().mockReturnThis(),
      delete: jest.fn().mockReturnThis(),
      eq: jest.fn().mockReturnThis(),
      match: jest.fn().mockReturnThis(),
    })),
    auth: {
      getUser: jest.fn().mockResolvedValue({ data: { user: null }, error: null }),
      getSession: jest.fn().mockResolvedValue({ data: { session: null }, error: null }),
    },
  } as unknown as jest.Mocked<SupabaseClient>;
}

/**
 * Mock Supabase admin client (for privilege operations)
 */
export function createMockAdminClient(): jest.Mocked<SupabaseClient> {
  return createMockSupabaseClient();
}

/**
 * Create a mock request with JSON body
 */
export function createMockRequestWithBody(
  body: Record<string, unknown>,
  method = "POST"
): NextRequest {
  return createMockNextRequest({
    method,
    json: jest.fn(async () => body),
  });
}

/**
 * Create a mock request with headers
 */
export function createMockRequestWithHeaders(headers: Record<string, string>): NextRequest {
  return createMockNextRequest({
    headers: new Headers(headers),
  });
}

/**
 * Mock response helper for testing API handlers
 */
export function createMockResponse() {
  const response = {
    status: 200,
    headers: new Map<string, string>(),
    body: null as any,
  };

  return {
    ...response,
    json: jest.fn((data: any, options?: { status?: number }) => {
      response.body = data;
      response.status = options?.status || 200;
      return response;
    }),
    text: jest.fn((text: string, options?: { status?: number }) => {
      response.body = text;
      response.status = options?.status || 200;
      return response;
    }),
  };
}
