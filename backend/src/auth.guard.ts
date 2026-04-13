/**
 * Optional Bearer token auth guard.
 *
 * When the PATENTFORGE_TOKEN environment variable is set, all API requests
 * must include `Authorization: Bearer <token>` with a matching value.
 *
 * When PATENTFORGE_TOKEN is not set, auth is disabled and all requests pass.
 * This preserves backward compatibility for single-user local deployments.
 */

import { Injectable, CanActivate, ExecutionContext, UnauthorizedException } from '@nestjs/common';
import { Request } from 'express';
import * as crypto from 'crypto';

@Injectable()
export class AuthGuard implements CanActivate {
  private readonly token: string | undefined;

  /** One-time download tokens: token → expiry timestamp. Single-use, short-lived. */
  private static downloadTokens = new Map<string, number>();
  private static readonly DOWNLOAD_TOKEN_TTL_MS = 5 * 60 * 1000; // 5 minutes

  constructor() {
    this.token = process.env.PATENTFORGE_TOKEN;
    if (this.token) {
      console.log('[Auth] Token-based authentication enabled (PATENTFORGE_TOKEN is set)');
    }
  }

  /**
   * Generate a single-use download token valid for 5 minutes.
   * Use this for download links and iframes instead of exposing the
   * long-lived PATENTFORGE_TOKEN in query parameters.
   */
  static generateDownloadToken(): string {
    const token = crypto.randomBytes(32).toString('hex');
    const expiry = Date.now() + AuthGuard.DOWNLOAD_TOKEN_TTL_MS;
    AuthGuard.downloadTokens.set(token, expiry);
    // Prune expired tokens on each generation to prevent unbounded growth
    for (const [t, exp] of AuthGuard.downloadTokens) {
      if (exp < Date.now()) AuthGuard.downloadTokens.delete(t);
    }
    return token;
  }

  /**
   * Constant-time string comparison to prevent timing attacks on token auth.
   */
  private timingSafeEqual(a: string, b: string): boolean {
    const bufA = Buffer.from(a, 'utf-8');
    const bufB = Buffer.from(b, 'utf-8');
    if (bufA.length !== bufB.length) return false;
    return crypto.timingSafeEqual(bufA, bufB);
  }

  canActivate(context: ExecutionContext): boolean {
    // No token configured — auth disabled
    if (!this.token) return true;

    const request = context.switchToHttp().getRequest<Request>();
    const authHeader = request.headers.authorization;

    // Try Bearer header first (standard API auth)
    if (authHeader) {
      const [scheme, value] = authHeader.split(' ');
      if (scheme === 'Bearer' && this.timingSafeEqual(value ?? '', this.token)) {
        return true;
      }
    }

    // Check for one-time download token (preferred for links/iframes)
    const queryToken = request.query?.token as string | undefined;
    if (queryToken) {
      const expiry = AuthGuard.downloadTokens.get(queryToken);
      if (expiry && expiry > Date.now()) {
        AuthGuard.downloadTokens.delete(queryToken); // Single-use: consume on first use
        return true;
      }
      // Also accept the long-lived token for backward compatibility
      if (this.timingSafeEqual(queryToken, this.token)) {
        return true;
      }
    }

    if (!authHeader && !queryToken) {
      throw new UnauthorizedException('Authentication required. Set Authorization: Bearer <token> header.');
    }
    throw new UnauthorizedException('Invalid authentication token.');
  }
}
