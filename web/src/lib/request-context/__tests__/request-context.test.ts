/**
 * Tests for lib/request-context.ts
 * Coverage: Request ID generation, structured logging, context creation
 */

import {
  generateRequestId,
  createLogEntry,
  createRequestContext,
  LogEntry,
} from '../request-context';
import { createMockNextRequest } from '@/__tests__/utils/mocks';

describe('Request Context', () => {
  describe('generateRequestId()', () => {
    it('should generate a unique request ID with correct format', () => {
      const id = generateRequestId();
      expect(id).toMatch(/^req_[a-z0-9]+_[a-z0-9]+$/);
    });

    it('should generate different IDs on each call', () => {
      const id1 = generateRequestId();
      const id2 = generateRequestId();
      expect(id1).not.toBe(id2);
    });

    it('should start with "req_" prefix', () => {
      const id = generateRequestId();
      expect(id).toMatch(/^req_/);
    });

    it('should have reasonable length (30-50 chars)', () => {
      const id = generateRequestId();
      expect(id.length).toBeGreaterThan(20);
      expect(id.length).toBeLessThan(60);
    });
  });

  describe('createRequestContext()', () => {
    it('should create context with all required fields', () => {
      const req = createMockNextRequest();
      const ctx = createRequestContext(req);

      expect(ctx).toHaveProperty('requestId');
      expect(ctx).toHaveProperty('startTime');
      expect(ctx).toHaveProperty('method');
      expect(ctx).toHaveProperty('pathname');
    });

    it('should extract method from request', () => {
      const req = createMockNextRequest({ method: 'POST' });
      const ctx = createRequestContext(req);
      expect(ctx.method).toBe('POST');
    });

    it('should extract pathname from request URL', () => {
      const req = createMockNextRequest();
      const ctx = createRequestContext(req);
      expect(ctx.pathname).toBe('/api/test');
    });

    it('should generate valid request ID', () => {
      const req = createMockNextRequest();
      const ctx = createRequestContext(req);
      expect(ctx.requestId).toMatch(/^req_/);
    });

    it('should set startTime to current time', () => {
      const before = Date.now();
      const req = createMockNextRequest();
      const ctx = createRequestContext(req);
      const after = Date.now();

      expect(ctx.startTime).toBeGreaterThanOrEqual(before);
      expect(ctx.startTime).toBeLessThanOrEqual(after);
    });

    it('should not set userId/orgId by default', () => {
      const req = createMockNextRequest();
      const ctx = createRequestContext(req);
      expect(ctx.userId).toBeUndefined();
      expect(ctx.orgId).toBeUndefined();
    });
  });

  describe('createLogEntry()', () => {
    it('should create a structured log entry', () => {
      const entry = createLogEntry('info', 'api', 'Test message');

      expect(entry).toHaveProperty('timestamp');
      expect(entry).toHaveProperty('level');
      expect(entry).toHaveProperty('service');
      expect(entry).toHaveProperty('message');
    });

    it('should set correct log level', () => {
      const entry = createLogEntry('error', 'api', 'Error occurred');
      expect(entry.level).toBe('error');
    });

    it('should set correct service name', () => {
      const services: LogEntry['service'][] = ['api', 'auth', 'audit', 'database', 'ai', 'email'];
      services.forEach((svc) => {
        const entry = createLogEntry('info', svc, 'Test');
        expect(entry.service).toBe(svc);
      });
    });

    it('should include request context if provided', () => {
      const ctx = {
        requestId: 'req_test123',
        userId: 'user-123',
        orgId: 'org-456',
        pathname: '/api/users',
        method: 'POST',
        statusCode: 201,
      };

      const entry = createLogEntry('info', 'api', 'User created', ctx);

      expect(entry.requestId).toBe('req_test123');
      expect(entry.userId).toBe('user-123');
      expect(entry.orgId).toBe('org-456');
      expect(entry.route).toBe('/api/users');
      expect(entry.method).toBe('POST');
      expect(entry.statusCode).toBe(201);
    });

    it('should include error details if error provided', () => {
      const error = new Error('Test error');
      const entry = createLogEntry('error', 'api', 'Something failed', { error });

      expect(entry.error).toBeDefined();
      expect(entry.error?.name).toBe('Error');
      expect(entry.error?.message).toBe('Test error');
    });

    it('should exclude error stack in production', () => {
      const originalEnv = process.env.NODE_ENV;
      process.env.NODE_ENV = 'production';

      const error = new Error('Test error');
      const entry = createLogEntry('error', 'api', 'Something failed', { error });

      expect(entry.error?.stack).toBeUndefined();

      process.env.NODE_ENV = originalEnv;
    });

    it('should include error stack in development', () => {
      const originalEnv = process.env.NODE_ENV;
      process.env.NODE_ENV = 'development';

      const error = new Error('Test error');
      const entry = createLogEntry('error', 'api', 'Something failed', { error });

      expect(entry.error?.stack).toBeDefined();

      process.env.NODE_ENV = originalEnv;
    });

    it('should include duration if provided', () => {
      const entry = createLogEntry('info', 'api', 'Request completed', { duration: 125 });
      expect(entry.duration).toBe(125);
    });

    it('should include custom metadata', () => {
      const metadata = { userId: 'user-123', action: 'create' };
      const entry = createLogEntry('info', 'api', 'Action performed', { metadata });

      expect(entry.metadata).toEqual(metadata);
    });

    it('should use ISO timestamp', () => {
      const entry = createLogEntry('info', 'api', 'Test');
      expect(entry.timestamp).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/);
    });
  });

  describe('Log entry validation', () => {
    it('should create valid JSON from log entry', () => {
      const entry = createLogEntry('info', 'api', 'Test message', {
        requestId: 'req-123',
        userId: 'user-456',
        statusCode: 200,
        duration: 100,
      });

      const json = JSON.stringify(entry);
      const parsed = JSON.parse(json);

      expect(parsed.level).toBe('info');
      expect(parsed.service).toBe('api');
      expect(parsed.message).toBe('Test message');
    });

    it('should not include undefined fields', () => {
      const entry = createLogEntry('info', 'api', 'Test');
      const json = JSON.stringify(entry);

      // These should not be in the JSON
      expect(json).not.toContain('undefined');
    });
  });

  describe('Log levels', () => {
    it('should support all log levels', () => {
      const levels: LogEntry['level'][] = ['debug', 'info', 'warn', 'error'];

      levels.forEach((level) => {
        const entry = createLogEntry(level, 'api', 'Test');
        expect(entry.level).toBe(level);
      });
    });
  });
});
