import { Module } from '@nestjs/common';
import { ThrottlerModule } from '@nestjs/throttler';
import { ServeStaticModule } from '@nestjs/serve-static';
import { join } from 'path';
import { PrismaModule } from './prisma/prisma.module';
import { ProjectsModule } from './projects/projects.module';
import { FeasibilityModule } from './feasibility/feasibility.module';
import { SettingsModule } from './settings/settings.module';
import { PriorArtModule } from './prior-art/prior-art.module';
import { PatentDetailModule } from './patent-detail/patent-detail.module';
import { ClaimDraftModule } from './claim-draft/claim-draft.module';
import { ComplianceModule } from './compliance/compliance.module';
import { ApplicationModule } from './application/application.module';
import { HealthController } from './health.controller';

@Module({
  controllers: [HealthController],
  imports: [
    // Serve frontend static files in production mode only.
    // Dev mode uses Vite's dev server on port 8080 instead.
    ...(process.env.NODE_ENV === 'production'
      ? [
          ServeStaticModule.forRoot({
            rootPath: process.env.FRONTEND_DIST_PATH || join(__dirname, '..', '..', 'frontend', 'dist'),
            exclude: ['/api/(.*)'],
          }),
        ]
      : []),
    ThrottlerModule.forRoot([{ ttl: 60_000, limit: 5 }]),
    PrismaModule,
    ProjectsModule,
    FeasibilityModule,
    SettingsModule,
    PriorArtModule,
    PatentDetailModule,
    ClaimDraftModule,
    ComplianceModule,
    ApplicationModule,
  ],
})
export class AppModule {}
