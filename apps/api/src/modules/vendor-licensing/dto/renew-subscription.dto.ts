import { Type } from "class-transformer";
import { IsInt, IsOptional, Min } from "class-validator";

export class RenewSubscriptionDto {
  /** Number of billing cycles to renew by. Defaults to 1. */
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  periods?: number;
}
