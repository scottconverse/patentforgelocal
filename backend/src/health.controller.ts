import { Controller, Get } from '@nestjs/common';

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
}
