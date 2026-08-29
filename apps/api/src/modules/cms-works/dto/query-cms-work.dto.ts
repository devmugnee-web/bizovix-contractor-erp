import { CmsWorkStatus } from "@bizovix/database";
import { Transform } from "class-transformer";
import { IsBoolean, IsDateString, IsEnum, IsOptional, IsString } from "class-validator";
import { PaginationQueryDto } from "../../../common/dto/pagination-query.dto";

export class QueryCmsWorkDto extends PaginationQueryDto {
  @IsOptional() @IsEnum(CmsWorkStatus) status?: CmsWorkStatus;
  @IsOptional()
  @Transform(({ value }) => (value === "true" ? true : value === "false" ? false : value))
  @IsBoolean()
  includeClosed?: boolean;
  @IsOptional() @IsString() organizationMasterId?: string;
  @IsOptional() @IsString() workCategory?: string;
  @IsOptional() @IsDateString() completionDateFrom?: string;
  @IsOptional() @IsDateString() completionDateTo?: string;
}
