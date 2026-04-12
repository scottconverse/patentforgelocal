/**
 * Tests for the optional Bearer token auth guard.
 */

import { ExecutionContext, UnauthorizedException } from '@nestjs/common';
import { AuthGuard } from './auth.guard';

function mockContext(authHeader?: string, query?: Record<string, string>): ExecutionContext {
  return {
    switchToHttp: () => ({
      getRequest: () => ({
        headers: authHeader ? { authorization: authHeader } : {},
        query: query ?? {},
      }),
    }),
    // eslint-disable-next-line @typescript-eslint/no-explicit-any -- partial mock for unit test
  } as any;
}

describe('AuthGuard', () => {
  const originalEnv = process.env.PATENTFORGE_TOKEN;

  afterEach(() => {
    if (originalEnv !== undefined) {
      process.env.PATENTFORGE_TOKEN = originalEnv;
    } else {
      delete process.env.PATENTFORGE_TOKEN;
    }
  });

  it('allows all requests when PATENTFORGE_TOKEN is not set', () => {
    delete process.env.PATENTFORGE_TOKEN;
    const guard = new AuthGuard();
    expect(guard.canActivate(mockContext())).toBe(true);
    expect(guard.canActivate(mockContext('Bearer anything'))).toBe(true);
  });

  it('allows requests with correct token', () => {
    process.env.PATENTFORGE_TOKEN = 'my-secret-token';
    const guard = new AuthGuard();
    expect(guard.canActivate(mockContext('Bearer my-secret-token'))).toBe(true);
  });

  it('rejects requests without auth header when token is set', () => {
    process.env.PATENTFORGE_TOKEN = 'my-secret-token';
    const guard = new AuthGuard();
    expect(() => guard.canActivate(mockContext())).toThrow(UnauthorizedException);
  });

  it('rejects requests with wrong token', () => {
    process.env.PATENTFORGE_TOKEN = 'my-secret-token';
    const guard = new AuthGuard();
    expect(() => guard.canActivate(mockContext('Bearer wrong-token'))).toThrow(UnauthorizedException);
  });

  it('rejects requests with non-Bearer scheme', () => {
    process.env.PATENTFORGE_TOKEN = 'my-secret-token';
    const guard = new AuthGuard();
    expect(() => guard.canActivate(mockContext('Basic my-secret-token'))).toThrow(UnauthorizedException);
  });

  it('allows requests with correct query param token (iframe/download fallback)', () => {
    process.env.PATENTFORGE_TOKEN = 'my-secret-token';
    const guard = new AuthGuard();
    expect(guard.canActivate(mockContext(undefined, { token: 'my-secret-token' }))).toBe(true);
  });

  it('rejects requests with wrong query param token', () => {
    process.env.PATENTFORGE_TOKEN = 'my-secret-token';
    const guard = new AuthGuard();
    expect(() => guard.canActivate(mockContext(undefined, { token: 'wrong-token' }))).toThrow(UnauthorizedException);
  });

  it('prefers Bearer header over query param', () => {
    process.env.PATENTFORGE_TOKEN = 'my-secret-token';
    const guard = new AuthGuard();
    // Correct header + wrong query param → should pass (header wins)
    expect(guard.canActivate(mockContext('Bearer my-secret-token', { token: 'wrong' }))).toBe(true);
  });
});
