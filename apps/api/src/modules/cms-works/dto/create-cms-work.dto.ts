import { Type } from "class-transformer";
import { IsDateString, IsNotEmpty, IsNumber, IsOptional, IsPositive, IsString } from "class-validator";

export class CreateCmsWorkDto {
  @IsString() @IsNotEmpty() organizationMasterId!: string;
  @IsString() @IsNotEmpty() workName!: string;
  @IsString() @IsNotEmpty() workCategory!: string;
  @Type(() => Number) @IsNumber() @IsPositive() contractValue!: number;
  @IsOptional() @IsDateString() startDate?: string;
  @IsOptional() @IsDateString() expectedCompletionDate?: string;
}
