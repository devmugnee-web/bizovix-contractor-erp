import { Type } from "class-transformer";
import { IsIn, IsInt, IsOptional, IsString, Length, Matches, Max, Min } from "class-validator";

export const ISSUE_TYPES = ["TECHNICAL", "HOW_TO", "DATA", "FEATURE", "ACCOUNT"] as const;
export const PRIORITIES = ["NORMAL", "HIGH", "URGENT"] as const;
export const STATUSES = ["OPEN", "IN_PROGRESS", "WAITING_FOR_CUSTOMER", "RESOLVED", "CLOSED"] as const;

export class CreateSupportTicketDto {
  @IsString() @Length(5, 180) subject!: string;
  @IsIn(ISSUE_TYPES) issueType!: (typeof ISSUE_TYPES)[number];
  @IsString() @Length(2, 100) moduleName!: string;
  @IsIn(PRIORITIES) priority!: (typeof PRIORITIES)[number];
  @IsString() @Length(10, 5000) description!: string;
  @IsOptional() @Matches(/^\/[a-zA-Z0-9/_-]{0,499}$/) pagePath?: string;
  @IsOptional() @IsString() @Length(1, 50) appVersion?: string;
}

export class ReplySupportTicketDto {
  @IsString() @Length(1, 5000) body!: string;
}

export class UpdateSupportTicketStatusDto {
  @IsIn(STATUSES) status!: (typeof STATUSES)[number];
}

export class QuerySupportTicketDto {
  @IsOptional() @Type(() => Number) @IsInt() @Min(1) page?: number;
  @IsOptional() @Type(() => Number) @IsInt() @Min(1) @Max(100) limit?: number;
  @IsOptional() @IsIn(STATUSES) status?: (typeof STATUSES)[number];
  @IsOptional() @IsString() @Length(1, 100) search?: string;
}
