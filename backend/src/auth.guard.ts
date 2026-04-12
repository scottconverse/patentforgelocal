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

  constructor() {
    this.token = process.env.PATENTFORGE_TOKEN;
    if (this.token) {
      console.log('[Auth] Token-based authentication enabled (PATENTFORGE_TOKEN is set)');
    }
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

    // Fall back to ?token= query param (for iframes and download links that
    // cannot send custom headers). Same constant-time comparison.
    const queryToken = request.query?.token as string | undefined;
    if (queryToken && this.timingSafeEqual(queryToken, this.token)) {
      return true;
    }

    if (!authHeader && !queryToken) {
      throw new UnauthorizedException('Authentication required. Set Authorization: Bearer <token> header.');
    }
    throw new UnauthorizedException('Invalid authentication token.');
  }
}
