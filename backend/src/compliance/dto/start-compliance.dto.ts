import { IsOptional, IsNumber, Min, Max } from 'class-validator';

export class StartComplianceDto {
  @IsOptional()
  @IsNumber()
  @Min(1)
  @Max(50)
  draftVersion?: number;
}
