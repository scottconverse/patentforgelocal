import { Controller, Get, Param } from '@nestjs/common';
import { PatentDetailService } from './patent-detail.service';

@Controller('patents')
export class PatentDetailController {
  constructor(private readonly service: PatentDetailService) {}

  /** GET /api/patents/:patentNumber — full enriched patent detail (cached) */
  @Get(':patentNumber')
  async getDetail(@Param('patentNumber') patentNumber: string) {
    return this.service.getDetail(patentNumber);
  }

  /** GET /api/patents/:patentNumber/claims — just claims text (lazy load) */
  @Get(':patentNumber/claims')
  async getClaims(@Param('patentNumber') patentNumber: string) {
    return this.service.getClaims(patentNumber);
  }

  /** GET /api/patents/:patentNumber/family — patent family/continuity data (cached) */
  @Get(':patentNumber/family')
  async getFamily(@Param('patentNumber') patentNumber: string) {
    return this.service.getFamily(patentNumber);
  }
}
