import { IsString, IsNotEmpty, MaxLength } from 'class-validator';

export class UpdateSectionDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(500000)
  text: string;
}
