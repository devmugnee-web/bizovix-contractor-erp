import { TenderStatus } from "@bizovix/database";
import { IsEnum, IsIn, IsOptional, IsString } from "class-validator";
import { PaginationQueryDto } from "../../../common/dto/pagination-query.dto";

export class QueryPendingTenderSecurityDto extends PaginationQueryDto {
  @IsOptional()
  @IsString()
  organizationId?: string;

  @IsOptional()
  @IsEnum(TenderStatus)
  tenderStatus?: TenderStatus;

  @IsOptional()
  @IsIn(["PENDING", "CREATED", "NOT_REQUIRED", "NO_DOCUMENT_PURCHASE"])
  securityStatus?: "PENDING" | "CREATED" | "NOT_REQUIRED" | "NO_DOCUMENT_PURCHASE";
}
