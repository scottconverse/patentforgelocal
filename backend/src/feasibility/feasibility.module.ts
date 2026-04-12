import { Module } from '@nestjs/common';
import { PrismaModule } from '../prisma/prisma.module';
import { SettingsModule } from '../settings/settings.module';
import { PriorArtModule } from '../prior-art/prior-art.module';
import { FeasibilityController } from './feasibility.controller';
import { FeasibilityService } from './feasibility.service';

@Module({
  imports: [PrismaModule, SettingsModule, PriorArtModule],
  controllers: [FeasibilityController],
  providers: [FeasibilityService],
  exports: [FeasibilityService],
})
export class FeasibilityModule {}
