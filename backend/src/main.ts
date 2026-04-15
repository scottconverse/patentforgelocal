import 'reflect-metadata';
import { existsSync, readFileSync } from 'fs';
import { join } from 'path';
import { NestFactory } from '@nestjs/core';
import { ValidationPipe } from '@nestjs/common';
import helmet from 'helmet';
import { AppModule } from './app.module';
import { AuthGuard } from './auth.guard';

/**
 * Validate required environment configuration at startup.
 * Fails fast with clear error messages instead of cryptic runtime failures.
 */
function validateEnvironment(): void {
  const errors: string[] = [];
  const warnings: string[] = [];

  // Required: DATABASE_URL must be set (SQLite or PostgreSQL)
  if (!process.env.DATABASE_URL) {
    errors.push(
      'DATABASE_URL is not set. ' +
        'For local dev: create backend/.env with DATABASE_URL="file:./prisma/dev.db". ' +
        'For Docker: set DATABASE_URL in docker-compose.yml environment.',
    );
  }

  // Optional — Ollama API key enables web search (not required for local inference)
  if (!process.env.OLLAMA_API_KEY) {
    warnings.push(
      'OLLAMA_API_KEY is not set. Web search during analysis will be unavailable. ' +
        'Users can set it via the Settings page (optional — analysis works without it).',
    );
  }

  if (!process.env.INTERNAL_SERVICE_SECRET && process.env.NODE_ENV === 'production') {
    errors.push('INTERNAL_SERVICE_SECRET is required in production. ' + 'Generate one: openssl rand -hex 32');
  }

  // Warn if production mode has no frontend assets to serve
  if (process.env.NODE_ENV === 'production') {
    const fallbackDist = join(__dirname, '..', '..', 'frontend', 'dist');
    if (!process.env.FRONTEND_DIST_PATH && !existsSync(fallbackDist)) {
      warnings.push(
        'NODE_ENV is "production" but FRONTEND_DIST_PATH is not set and the ' +
          `default path (${fallbackDist}) does not exist. The API will work, ` +
          'but the UI will not be served. Set FRONTEND_DIST_PATH to the ' +
          'frontend build output directory.',
      );
    }
  }

  // Warn on unrecognized NODE_ENV values
  if (process.env.NODE_ENV && !['development', 'production'].includes(process.env.NODE_ENV)) {
    warnings.push(
      `NODE_ENV is set to "${process.env.NODE_ENV}" which is not a recognized value. ` +
        'Expected "development" or "production".',
    );
  }

  // Log warnings (non-fatal)
  for (const w of warnings) {
    console.warn(`⚠ Config warning: ${w}`);
  }

  // Fatal errors — stop the process
  if (errors.length > 0) {
    console.error('\n✖ PatentForgeLocal backend failed to start due to missing configuration:\n');
    for (const e of errors) {
      console.error(`  • ${e}\n`);
    }
    console.error('Fix the above and restart.\n');
    process.exit(1);
  }
}

async function bootstrap() {
  validateEnvironment();

  const app = await NestFactory.create(AppModule);

  // Security headers — applied before any other middleware.
  // CSP is disabled because the frontend is served separately (or via ServeStatic)
  // and needs to load its own scripts; tighten if serving the SPA from this server.
  app.use(
    helmet({
      contentSecurityPolicy: false,
    }),
  );

  app.setGlobalPrefix('api');

  // In dev mode, provide a helpful JSON response at / since the frontend
  // runs on a separate Vite dev server. In production, ServeStaticModule
  // serves the frontend at / — registering this handler would intercept it.
  if (process.env.NODE_ENV !== 'production') {
    app.getHttpAdapter().get('/', (_req, res) => {
      res.json({
        service: 'PatentForgeLocal API',
        version: require('../package.json').version,
        status: 'running',
        docs: 'All endpoints are prefixed with /api/. See /api/health for a health check.',
        endpoints: {
          health: '/api/health',
          projects: '/api/projects',
          settings: '/api/settings',
        },
      });
    });
  }

  const allowedOrigins = (process.env.ALLOWED_ORIGINS || 'http://localhost:8080')
    .split(',')
    .map((o) => o.trim())
    .filter(Boolean);
  app.enableCors({
    origin: allowedOrigins,
    methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization'],
    credentials: true,
  });

  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      transform: true,
    }),
  );

  // Optional token-based auth — set PATENTFORGE_TOKEN env var to enable
  app.useGlobalGuards(new AuthGuard());

  // SPA fallback — serve index.html for non-API GET requests that don't
  // match a static file. This enables client-side routing (e.g. /projects/:id).
  // Uses Express middleware (not a route) to avoid path-to-regexp v8 wildcard issues.
  if (process.env.NODE_ENV === 'production') {
    const frontendDist =
      process.env.FRONTEND_DIST_PATH || join(__dirname, '..', '..', 'frontend', 'dist');
    const indexPath = join(frontendDist, 'index.html');
    if (existsSync(indexPath)) {
      const indexHtml = readFileSync(indexPath, 'utf-8');
      const expressApp = app.getHttpAdapter().getInstance();
      // Register after all NestJS routes — express 'use' at this point acts as a
      // final fallback because NestJS routes are already mounted.
      expressApp.use((req: any, res: any, next: any) => {
        // Only intercept GET requests for client-side routes (no dot = not a file)
        if (req.method === 'GET' && !req.originalUrl.startsWith('/api/') && !req.originalUrl.includes('.')) {
          return res.type('text/html').send(indexHtml);
        }
        next();
      });
    }
  }

  const port = parseInt(process.env.PORT || '3000', 10);
  await app.listen(port);
  console.log(`PatentForgeLocal backend running on http://localhost:${port}`);
}

bootstrap();
