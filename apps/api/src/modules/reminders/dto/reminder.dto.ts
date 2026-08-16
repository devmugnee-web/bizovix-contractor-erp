import { Type } from "class-transformer";
import { IsDateString, IsIn, IsInt, IsOptional, IsString, Max, Min } from "class-validator";
const priorities = ["LOW", "MEDIUM", "HIGH", "CRITICAL"];
export class QueryReminderDto {
  @IsOptional() @Type(() => Number) @IsInt() @Min(1) page?: number;
  @IsOptional() @Type(() => Number) @IsInt() @Min(1) @Max(100) limit?: number;
  @IsOptional() @IsString() search?: string;
  @IsOptional() @IsDateString() dateFrom?: string;
  @IsOptional() @IsDateString() dateTo?: string;
  @IsOptional() @IsString() type?: string;
  @IsOptional() @IsString() status?: string;
  @IsOptional() @IsString() priority?: string;
  @IsOptional() @IsString() assignedToUserId?: string;
  @IsOptional() @IsString() sourceModule?: string;
}
export class SaveReminderDto {
  @IsString() title!: string;
  @IsString() type!: string;
  @IsOptional() @IsString() description?: string;
  @IsDateString() dueDate!: string;
  @IsOptional() @IsString() dueTime?: string;
  @IsIn(priorities) priority!: string;
  @IsOptional() @IsString() assignedToUserId?: string;
  @IsString() assignedToName!: string;
  @IsOptional() @IsString() sourceModule?: string;
  @IsOptional() @IsString() sourceType?: string;
  @IsOptional() @IsString() sourceId?: string;
  @IsOptional() @IsString() relatedEntityName?: string;
  @IsOptional() @IsString() referenceNo?: string;
  @IsOptional() @IsString() organizationName?: string;
  @IsOptional() @Type(() => Number) @IsInt() @Min(0) notificationBefore?: number;
  @IsOptional() @IsString() repeatType?: string;
  @IsOptional() @IsString() remarks?: string;
}
export class UpdateReminderDto extends SaveReminderDto {}
export class SnoozeReminderDto {
  @IsDateString() until!: string;
}
