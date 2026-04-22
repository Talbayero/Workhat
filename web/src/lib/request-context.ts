/**
 * Request context management
 * Provides request ID generation, structured logging, and request-scoped state
 */

import { randomUUID } from 'crypto';
import type { NextRequest } from 'next/server';

// AsyncLocalStorage would be ideal but requires Node.js context
// For now, we'll use a WeakMap-based approach per request
const requestContextMap = new WeakMap<object, RequestContext>();

export interface RequestContext {
  requestId: string;
  startTime: number;
  method: string;
  pathname: string;
  userId?: string;
  orgId?: string;
}

/**
 * Generate a unique request ID
 * Format: req_<timestamp>_<uuid>
 */
export function generateRequestId(): string {
  const timestamp = Date.now().toString(36);
  const uuid = randomUUID().slice(0, 8);
  return `req_${timestamp}_${uuid}`;
}

/**
 * Create request context from NextRequest
 */
export function createRequestContext(req: NextRequest): RequestContext {
  const url = new URL(req.url);
  return {
    requestId: generateRequestId(),
    startTime: Date.now(),
    method: req.method,
    pathname: url.pathname,
  };
}

/**
 * Structured logging utility
 * Outputs JSON logs with request context
 */
export interface LogEntry {
  timestamp: string;
  level: 'debug' | 'info' | 'warn' | 'error';
  requestId?: string;
  userId?: string;
  orgId?: string;
  service: 'api' | 'auth' | 'audit' | 'database' | 'ai' | 'email';
  route?: string;
  method?: string;
  statusCode?: number;
  message: string;
  duration?: number;
  error?: {
    name: string;
    message: string;
    stack?: string;
  };
  metadata?: Record<string, unknown>;
}

export function createLogEntry(
  level: LogEntry['level'],
  service: LogEntry['service'],
  message: string,
  ctx?: Partial<RequestContext> & { statusCode?: number; duration?: number; error?: Error; metadata?: Record<string, unknown> }
): LogEntry {
  const entry: LogEntry = {
    timestamp: new Date().toISOString(),
    level,
    service,
    message,
    requestId: ctx?.requestId,
    userId: ctx?.userId,
    orgId: ctx?.orgId,
    route: ctx?.pathname,
    method: ctx?.method,
    statusCode: ctx?.statusCode,
    duration: ctx?.duration,
  };

  if (ctx?.error) {
    entry.error = {
      name: ctx.error.name,
      message: ctx.error.message,
      stack: process.env.NODE_ENV === 'development' ? ctx.error.stack : undefined,
    };
  }

  if (ctx?.metadata) {
    entry.metadata = ctx.metadata;
  }

  return entry;
}

/**
 * Log structured entries to stdout
 * Can be piped to external logging service (DataDog, Sentry, etc.)
 */
export function logStructured(entry: LogEntry): void {
  console.log(JSON.stringify(entry));
}

/**
 * Convenience loggers
 */
export const logger = {
  debug: (service: LogEntry['service'], message: string, ctx?: Partial<RequestContext>) => {
    logStructured(createLogEntry('debug', service, message, ctx));
  },
  info: (service: LogEntry['service'], message: string, ctx?: Partial<RequestContext>) => {
    logStructured(createLogEntry('info', service, message, ctx));
  },
  warn: (service: LogEntry['service'], message: string, ctx?: Partial<RequestContext>) => {
    logStructured(createLogEntry('warn', service, message, ctx));
  },
  error: (service: LogEntry['service'], message: string, error?: Error, ctx?: Partial<RequestContext>) => {
    logStructured(createLogEntry('error', service, message, { ...ctx, error }));
  },
};

/**
 * Extract request context info from request headers/cookies
 * Helpful for cross-service tracing
 */
export function extractContextFromRequest(req: NextRequest): Partial<RequestContext> {
  const xRequestId = req.headers.get('x-request-id');
  // userId and orgId would come from auth middleware
  return {
    requestId: xRequestId || generateRequestId(),
  };
}
