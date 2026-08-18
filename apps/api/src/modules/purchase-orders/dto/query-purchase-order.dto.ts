import { PurchaseOrderStatus } from "@bizovix/database";
import { IsEnum, IsOptional, IsString } from "class-validator";
import { PaginationQueryDto } from "../../../common/dto/pagination-query.dto";

export class QueryPurchaseOrderDto extends PaginationQueryDto {
  @IsOptional()
  @IsEnum(PurchaseOrderStatus)
  status?: PurchaseOrderStatus;

  @IsOptional()
  @IsString()
  supplierId?: string;

  @IsOptional()
  @IsString()
  cmsWorkId?: string;

  @IsOptional()
  @IsString()
  comparativeStatementId?: string;
}
