import { IsOptional, IsString, IsInt, IsNumber, IsBoolean, IsIn, Min } from 'class-validator';
import { Type } from 'class-transformer';
import { PROVIDERS } from '../provider.types';

export class UpdateSettingsDto {
  // ── Provider routing (Run 4) ──────────────────────────────────────────────

  @IsOptional()
  @IsString()
  @IsIn(PROVIDERS)
  provider?: 'LOCAL' | 'CLOUD';

  @IsOptional()
  @IsString()
  cloudApiKey?: string;

  @IsOptional()
  @IsString()
  cloudDefaultModel?: string;

  @IsOptional()
  @IsString()
  localDefaultModel?: string;

  // ── Legacy / general ──────────────────────────────────────────────────────

  /**
   * @deprecated Removed in Run 4 — Ollama doesn't authenticate. Field accepted
   * for one-cycle backward compatibility with older clients; the value is
   * ignored by the service and a deprecation warning is logged.
   */
  @IsOptional()
  @IsString()
  ollamaApiKey?: string;

  @IsOptional()
  @IsString()
  defaultModel?: string;

  @IsOptional()
  @IsString()
  researchModel?: string;

  @IsOptional()
  @IsInt()
  @Min(1)
  @Type(() => Number)
  maxTokens?: number;

  @IsOptional()
  @IsInt()
  @Min(0)
  @Type(() => Number)
  interStageDelaySeconds?: number;

  @IsOptional()
  @IsString()
  exportPath?: string;

  @IsOptional()
  @IsBoolean()
  autoExport?: boolean;

  @IsOptional()
  @IsString()
  ollamaModel?: string;

  @IsOptional()
  @IsString()
  ollamaUrl?: string;

  @IsOptional()
  @IsBoolean()
  modelReady?: boolean;

  @IsOptional()
  @IsString()
  usptoApiKey?: string;
}
