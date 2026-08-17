import { BillStatus } from "@bizovix/database";
import { IsEnum, IsOptional, IsString } from "class-validator";
import { PaginationQueryDto } from "../../../common/dto/pagination-query.dto";

export class QueryProjectBillDto extends PaginationQueryDto {
  @IsOptional()
  @IsString()
  cmsWorkId?: string;

  @IsOptional()
  @IsEnum(BillStatus)
  status?: BillStatus;
}
