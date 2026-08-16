import { ArrayNotEmpty, IsArray, IsBoolean, IsInt, IsString, Max, Min } from "class-validator";

export class UpdateDocumentSettingDto {
  @IsArray() @ArrayNotEmpty() @IsString({ each: true }) allowedFileTypes!: string[];
  @IsInt() @Min(1) @Max(100) maxFileSizeMb!: number;
  @IsInt() @Min(0) @Max(365) defaultExpiryReminderDays!: number;
  @IsBoolean() enableVersionControl!: boolean;
  @IsBoolean() enableExpiryTracking!: boolean;
  @IsBoolean() autoArchiveExpired!: boolean;
}
