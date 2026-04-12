import { Controller, Get, Post } from '@nestjs/common';
import { SystemService } from './system.service';

@Controller('api')
export class SystemController {
  constructor(private readonly systemService: SystemService) {}

  @Get('system-check')
  async getSystemCheck() {
    return this.systemService.getSystemCheck();
  }

  @Post('model-pull')
  async startModelPull() {
    return this.systemService.startModelPull();
  }

  @Get('model-pull-progress')
  getModelPullProgress() {
    return this.systemService.getModelPullProgress();
  }
}
