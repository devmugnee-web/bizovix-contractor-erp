import { IsInt, IsNumber, Max, Min } from "class-validator";

export class UpdateTenderBankSettingDto {
  @IsInt() @Min(1) @Max(3650) tenderValidityDays!: number;
  @IsInt() @Min(0) @Max(365) tenderOpeningReminderDays!: number;
  @IsInt() @Min(0) @Max(365) tenderExpiryReminderDays!: number;
  @IsNumber() @Min(0) @Max(100) tsDefaultSecurityPct!: number;
  @IsNumber() @Min(0) @Max(100) tsDefaultMarginPct!: number;
  @IsInt() @Min(1) @Max(120) tsDefaultValidityMonths!: number;
  @IsInt() @Min(0) @Max(365) tsExpiryReminderDays!: number;
  @IsNumber() @Min(0) @Max(100) pgBgDefaultMarginPct!: number;
  @IsInt() @Min(1) @Max(120) pgBgDefaultValidityMonths!: number;
  @IsNumber() @Min(0) @Max(100) pgBgDefaultInterestRate!: number;
  @IsInt() @Min(0) @Max(365) pgBgExpiryReminderDays!: number;
  @IsInt() @Min(0) @Max(365) pgBgMaturityReminderDays!: number;
  @IsNumber() @Min(0) creditCommitmentDefaultCharge!: number;
  @IsNumber() @Min(0) @Max(100) sdDefaultPct!: number;
  @IsInt() @Min(1) @Max(120) sdDefaultValidityMonths!: number;
}
