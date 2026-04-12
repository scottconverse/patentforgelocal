import { Module } from '@nestjs/common';
import { ClaimDraftController } from './claim-draft.controller';
import { ClaimDraftService } from './claim-draft.service';
import { PrismaModule } from '../prisma/prisma.module';
import { SettingsModule } from '../settings/settings.module';

@Module({
  imports: [PrismaModule, SettingsModule],
  controllers: [ClaimDraftController],
  providers: [ClaimDraftService],
})
export class ClaimDraftModule {}
