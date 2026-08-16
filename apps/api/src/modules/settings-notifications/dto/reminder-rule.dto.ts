import { ArrayNotEmpty, IsArray, IsBoolean, IsIn, IsInt, Min } from "class-validator";

export class UpdateReminderRuleDto {
  @IsBoolean() isEnabled!: boolean;
  @IsIn(["LOW", "MEDIUM", "HIGH", "CRITICAL"]) defaultPriority!: string;
  @IsArray() @ArrayNotEmpty() @IsInt({ each: true }) @Min(0, { each: true }) offsetDays!: number[];
  @IsBoolean() inAppEnabled!: boolean;
  @IsBoolean() emailEnabled!: boolean;
}
