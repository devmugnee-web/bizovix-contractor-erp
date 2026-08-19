import { Type } from "class-transformer";
import { IsDateString, IsNotEmpty, IsNumber, IsOptional, IsPositive, IsString } from "class-validator";

export class CreateCmsWorkDto {
  @IsString() @IsNotEmpty() organizationMasterId!: string;
  @IsString() @IsNotEmpty() workName!: string;
  @IsString() @IsNotEmpty() workCategory!: string;
  @Type(() => Number) @IsNumber() @IsPositive() contractValue!: number;
  @IsOptional() @IsDateString() startDate?: string;
  @IsOptional() @IsDateString() expectedCompletionDate?: string;

  /** Optional real FK to the awarded Tender — the Award → CMS handoff link. When set, the
   * backend validates the tender, blocks a duplicate work for the same tender, back-links the
   * originating Document Purchase where resolvable, and advances the tender to ONGOING. */
  @IsOptional() @IsString() tenderId?: string;
}
