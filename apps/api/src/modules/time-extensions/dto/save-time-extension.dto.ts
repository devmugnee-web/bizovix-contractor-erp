import { Type } from "class-transformer";
import { IsDateString, IsInt, IsNotEmpty, IsOptional, IsString, Min } from "class-validator";

export class SaveTimeExtensionDto {
  @IsString()
  @IsNotEmpty()
  contractId!: string;

  @IsDateString()
  requestDate!: string;

  @Type(() => Number)
  @IsInt()
  @Min(1)
  requestedDays!: number;

  @IsString()
  @IsNotEmpty()
  reason!: string;

  @IsOptional()
  @IsString()
  description?: string;
}

export class ApproveTimeExtensionDto {
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  approvedDays?: number;
}
