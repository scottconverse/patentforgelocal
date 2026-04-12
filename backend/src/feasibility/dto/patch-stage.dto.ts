import { IsOptional, IsString, IsBoolean, IsDateString, IsNumber } from 'class-validator';

export class PatchStageDto {
  @IsOptional()
  @IsString()
  runId?: string;

  @IsOptional()
  @IsString()
  status?: string;

  @IsOptional()
  @IsString()
  outputText?: string;

  @IsOptional()
  @IsString()
  model?: string;

  @IsOptional()
  @IsBoolean()
  webSearchUsed?: boolean;

  @IsOptional()
  @IsString()
  errorMessage?: string;

  @IsOptional()
  @IsDateString()
  startedAt?: string;

  @IsOptional()
  @IsDateString()
  completedAt?: string;

  @IsOptional()
  @IsNumber()
  inputTokens?: number;

  @IsOptional()
  @IsNumber()
  outputTokens?: number;

  @IsOptional()
  @IsNumber()
  estimatedCostUsd?: number;
}
