import { IsIn, IsInt, IsOptional, IsString, Max, MaxLength, Min } from "class-validator";

const DATE_FORMATS = ["DD/MM/YYYY", "DD-MMM-YYYY", "YYYY-MM-DD"];
const NUMBER_FORMATS = ["STANDARD", "LAKH_CRORE"];

export class UpdateGeneralSettingDto {
  @IsOptional() @IsString() @MaxLength(150) companyDisplayName?: string;
  @IsString() @MaxLength(10) defaultCurrency!: string;
  @IsString() @MaxLength(60) timezone!: string;
  @IsIn(DATE_FORMATS) dateFormat!: string;
  @IsIn(NUMBER_FORMATS) numberFormat!: string;
  @IsInt() @Min(1) @Max(12) financialYearStartMonth!: number;
  @IsString() @MaxLength(10) defaultLanguage!: string;
  @IsString() @MaxLength(60) country!: string;
  @IsInt() @Min(5) @Max(100) defaultPageSize!: number;
}
