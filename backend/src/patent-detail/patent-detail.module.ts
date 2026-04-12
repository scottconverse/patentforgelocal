import { Module } from '@nestjs/common';
import { PatentDetailController } from './patent-detail.controller';
import { PatentDetailService } from './patent-detail.service';
import { PrismaModule } from '../prisma/prisma.module';
import { SettingsModule } from '../settings/settings.module';

@Module({
  imports: [PrismaModule, SettingsModule],
  controllers: [PatentDetailController],
  providers: [PatentDetailService],
  exports: [PatentDetailService],
})
export class PatentDetailModule {}
