import { PurchaseType } from "@bizovix/database";
import { IsEnum, IsOptional, IsString } from "class-validator";
import { PaginationQueryDto } from "../../../common/dto/pagination-query.dto";

export class QueryDocumentPurchaseDto extends PaginationQueryDto {
  @IsOptional()
  @IsEnum(PurchaseType)
  purchaseType?: PurchaseType;

  @IsOptional()
  @IsString()
  organizationMasterId?: string;

  @IsOptional()
  @IsString()
  paymentFromAccountId?: string;
}
