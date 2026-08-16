import { IsBoolean, IsInt, IsOptional, Max, Min } from "class-validator";

export class UpdateSecuritySettingDto {
  @IsInt() @Min(6) @Max(32) minPasswordLength!: number;
  @IsBoolean() requireUppercase!: boolean;
  @IsBoolean() requireLowercase!: boolean;
  @IsBoolean() requireNumber!: boolean;
  @IsBoolean() requireSpecialChar!: boolean;
  @IsInt() @Min(5) @Max(1440) sessionTimeoutMinutes!: number;
  @IsInt() @Min(3) @Max(20) maxFailedLoginAttempts!: number;
  @IsInt() @Min(1) @Max(1440) accountLockDurationMinutes!: number;
  @IsOptional() @IsInt() @Min(1) @Max(365) forcePasswordChangeDays?: number;
  @IsBoolean() twoFactorEnabled!: boolean;
}
