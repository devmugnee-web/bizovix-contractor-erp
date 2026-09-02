import { IsOptional, IsString, MaxLength, MinLength } from "class-validator";

export class RequestUpgradeDto {
  @IsString()
  @MinLength(2)
  @MaxLength(80)
  planCode!: string;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  note?: string;
}
