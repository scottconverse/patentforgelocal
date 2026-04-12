import { IsString, IsNotEmpty, MaxLength } from 'class-validator';

export class UpdateClaimDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(10000)
  text: string;
}
