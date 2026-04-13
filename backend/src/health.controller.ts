import { Controller, Get, Post } from '@nestjs/common';
import { AuthGuard } from './auth.guard';

/**
 * Liveness probe for the tray app's health monitor.
 * Returns immediately — no external dependency checks.
 * Served at GET /api/health (global /api prefix applied).
 */
@Controller('health')
export class HealthController {
  @Get()
  check() {
    return { status: 'ok', service: 'patentforge-backend', timestamp: new Date().toISOString() };
  }

  /**
   * Generate a single-use download token (5-min TTL).
   * Frontend calls this before opening export links so the long-lived
   * PATENTFORGE_TOKEN is never exposed in URL query parameters.
   */
  @Post('download-token')
  generateDownloadToken() {
    const token = AuthGuard.generateDownloadToken();
    return { token };
  }
}
