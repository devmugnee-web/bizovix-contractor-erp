import { IsIn, IsOptional, IsString } from "class-validator";

export class UpgradePlanDto {
  @IsString() planId!: string;
  @IsIn(["MONTHLY", "YEARLY"]) billingCycle!: string;
}

export class CancelSubscriptionDto {
  @IsOptional() @IsString() reason?: string;
}
