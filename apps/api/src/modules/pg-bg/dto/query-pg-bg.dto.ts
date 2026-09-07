import { IsIn, IsOptional, IsString } from "class-validator";
import { PaginationQueryDto } from "../../../common/dto/pagination-query.dto";

export class QueryPgBgDto extends PaginationQueryDto {
  @IsOptional()
  @IsIn(["READY", "DRAFT", "NOA_ACCEPTED", "NOA_REJECTED", "FINALIZED"])
  workflowStatus?: "READY" | "DRAFT" | "NOA_ACCEPTED" | "NOA_REJECTED" | "FINALIZED";
}

export class QueryOrganizationContactsDto {
  @IsOptional()
  @IsString()
  organizationMasterId?: string;
}
