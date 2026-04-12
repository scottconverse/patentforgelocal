import { IsOptional, IsString, MaxLength } from 'class-validator';

export class StartRunDto {
  @IsOptional()
  @IsString()
  @MaxLength(50000)
  narrative?: string;
}
