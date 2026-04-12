import { IsInt, Min, Max } from 'class-validator';
import { Type } from 'class-transformer';

export class RerunFromStageDto {
  @IsInt()
  @Min(1)
  @Max(6)
  @Type(() => Number)
  fromStage: number;
}
