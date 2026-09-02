import { IsOptional, IsString, MinLength } from "class-validator";

export class CreateLedgerItemDto {
  @IsString()
  @MinLength(1)
  name!: string;

  @IsOptional()
  @IsString()
  @MinLength(1)
  unit?: string;
}
