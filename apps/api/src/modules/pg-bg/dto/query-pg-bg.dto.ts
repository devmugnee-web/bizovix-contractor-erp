import { IsOptional, IsString } from "class-validator";
import { PaginationQueryDto } from "../../../common/dto/pagination-query.dto";

export class QueryPgBgDto extends PaginationQueryDto {}

export class QueryOrganizationContactsDto {
  @IsOptional()
  @IsString()
  organizationMasterId?: string;
}
