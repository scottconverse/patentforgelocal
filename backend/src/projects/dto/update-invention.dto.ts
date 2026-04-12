import { IsString, IsNotEmpty, IsOptional } from 'class-validator';

export class UpdateInventionDto {
  @IsString()
  @IsNotEmpty()
  title: string;

  @IsString()
  @IsNotEmpty()
  description: string;

  @IsOptional()
  @IsString()
  problemSolved?: string;

  @IsOptional()
  @IsString()
  howItWorks?: string;

  @IsOptional()
  @IsString()
  aiComponents?: string;

  @IsOptional()
  @IsString()
  threeDPrintComponents?: string;

  @IsOptional()
  @IsString()
  whatIsNovel?: string;

  @IsOptional()
  @IsString()
  currentAlternatives?: string;

  @IsOptional()
  @IsString()
  whatIsBuilt?: string;

  @IsOptional()
  @IsString()
  whatToProtect?: string;

  @IsOptional()
  @IsString()
  additionalNotes?: string;
}
