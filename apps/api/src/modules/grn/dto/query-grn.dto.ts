import { GrnInspectionStatus } from "@bizovix/database";
import { IsEnum, IsOptional, IsString } from "class-validator";
import { PaginationQueryDto } from "../../../common/dto/pagination-query.dto";

export class QueryGrnDto extends PaginationQueryDto {
  @IsOptional()
  @IsString()
  purchaseOrderId?: string;

  @IsOptional()
  @IsEnum(GrnInspectionStatus)
  inspectionStatus?: GrnInspectionStatus;
}
