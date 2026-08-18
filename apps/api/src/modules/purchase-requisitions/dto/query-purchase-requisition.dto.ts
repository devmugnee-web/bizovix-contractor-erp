import { PrPriority, PrStatus } from "@bizovix/database";
import { IsEnum, IsOptional, IsString } from "class-validator";
import { PaginationQueryDto } from "../../../common/dto/pagination-query.dto";

export class QueryPurchaseRequisitionDto extends PaginationQueryDto {
  @IsOptional()
  @IsEnum(PrStatus)
  status?: PrStatus;

  @IsOptional()
  @IsEnum(PrPriority)
  priority?: PrPriority;

  @IsOptional()
  @IsString()
  cmsWorkId?: string;
}
