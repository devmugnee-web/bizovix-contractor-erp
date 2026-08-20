import { IsOptional, IsString } from "class-validator";

export class SuspendSubscriptionDto {
  @IsOptional()
  @IsString()
  reason?: string;
}
