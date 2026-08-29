import { ChallanSubmissionStatus } from "@bizovix/database";
import { IsDateString, IsEnum, IsOptional, IsString } from "class-validator";
import { PaginationQueryDto } from "../../../common/dto/pagination-query.dto";

export class QueryChallanSubmissionDto extends PaginationQueryDto {
  @IsOptional()
  @IsString()
  cmsWorkId?: string;

  @IsOptional()
  @IsEnum(ChallanSubmissionStatus)
  status?: ChallanSubmissionStatus;

  @IsOptional()
  @IsDateString()
  dateFrom?: string;

  @IsOptional()
  @IsDateString()
  dateTo?: string;
}
