import { BillMatchStatus, SupplierBillStatus } from "@bizovix/database";
import { IsEnum, IsOptional, IsString } from "class-validator";
import { PaginationQueryDto } from "../../../common/dto/pagination-query.dto";

export class QuerySupplierBillDto extends PaginationQueryDto {
  @IsOptional()
  @IsEnum(SupplierBillStatus)
  status?: SupplierBillStatus;

  @IsOptional()
  @IsEnum(BillMatchStatus)
  matchStatus?: BillMatchStatus;

  @IsOptional()
  @IsString()
  supplierId?: string;

  @IsOptional()
  @IsString()
  purchaseOrderId?: string;

  @IsOptional()
  @IsString()
  cmsWorkId?: string;
}
