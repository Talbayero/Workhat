/**
 * Middleware extension for request context injection
 * Add to middleware.ts to inject request ID into all responses
 *
 * Usage in middleware.ts:
 *   import { injectRequestContext } from "@/middleware-request-context";
 *
 *   export async function middleware(request: NextRequest) {
 *     // ... existing middleware code ...
 *     response = injectRequestContext(request, response);
 *     return response;
 *   }
 */

import { NextResponse, type NextRequest } from 'next/server';
import { createRequestContext, logger } from '@/lib/request-context';

/**
 * Inject request ID and context into response headers
 * Attaches to response for tracing and debugging
 */
export function injectRequestContext(
  request: NextRequest,
  response: NextResponse
): NextResponse {
  const ctx = createRequestContext(request);

  // Add request ID to response header for client-side tracing
  response.headers.set('X-Request-ID', ctx.requestId);
  response.headers.set('X-Request-Start-Time', ctx.startTime.toString());

  // Log request context
  logger.debug('api', `${ctx.method} ${ctx.pathname} started`, ctx);

  return response;
}

/**
 * Utility to measure request duration and log completion
 * Call this at the end of a route handler
 */
export function logRequestCompletion(
  ctx: { requestId: string; startTime: number; pathname: string; method: string },
  statusCode: number,
  error?: Error
) {
  const duration = Date.now() - ctx.startTime;

  if (error) {
    logger.error(
      'api',
      `${ctx.method} ${ctx.pathname} failed`,
      error,
      { ...ctx, statusCode, duration }
    );
  } else {
    logger.info(
      'api',
      `${ctx.method} ${ctx.pathname} completed`,
      { ...ctx, statusCode, duration }
    );
  }
}
