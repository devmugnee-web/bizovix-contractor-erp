import { ArrayUnique, IsArray, IsBoolean, IsInt, IsOptional, IsString, Matches, Max, Min, MinLength } from "class-validator";

const TIME_PATTERN = /^([01]\d|2[0-3]):([0-5]\d)$/;

export class CreateShiftDto {
  @IsString()
  @MinLength(1)
  name!: string;

  @IsString()
  @Matches(TIME_PATTERN, { message: "startTime must be in HH:mm 24-hour format" })
  startTime!: string;

  @IsString()
  @Matches(TIME_PATTERN, { message: "endTime must be in HH:mm 24-hour format" })
  endTime!: string;

  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(180)
  gracePeriodMinutes?: number;

  @IsArray()
  @ArrayUnique()
  @IsInt({ each: true })
  @Min(0, { each: true })
  @Max(6, { each: true })
  weeklyOffDays!: number[];

  @IsOptional()
  @IsBoolean()
  isDefault?: boolean;
}
