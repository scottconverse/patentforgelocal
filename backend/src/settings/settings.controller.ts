import { Controller, Get, Put, Post, Body, HttpCode, HttpStatus } from '@nestjs/common';
import { Throttle, ThrottlerGuard } from '@nestjs/throttler';
import { UseGuards } from '@nestjs/common';
import { SettingsService } from './settings.service';
import { UpdateSettingsDto } from './dto/update-settings.dto';

@Controller('settings')
export class SettingsController {
  constructor(private readonly settingsService: SettingsService) {}

  @Get()
  getSettings() {
    return this.settingsService.getSettings();
  }

  @Get('odp-usage')
  getOdpUsage() {
    return this.settingsService.getOdpUsageSummary();
  }

  @Put()
  @HttpCode(HttpStatus.OK)
  updateSettings(@Body() dto: UpdateSettingsDto) {
    return this.settingsService.updateSettings(dto);
  }

  @Post('validate-api-key')
  @UseGuards(ThrottlerGuard)
  @Throttle({ default: { limit: 5, ttl: 60_000 } })
  async validateApiKey(@Body() body: { apiKey: string }) {
    return this.settingsService.validateApiKey(body.apiKey);
  }
}
