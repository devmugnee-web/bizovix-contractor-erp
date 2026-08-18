import { PartyStatus } from "@bizovix/database";
import { IsEnum, IsOptional, IsString } from "class-validator";
import { PaginationQueryDto } from "../../../common/dto/pagination-query.dto";

export class QueryPartyDto extends PaginationQueryDto {
  /** Comma-separated PartyRole values, e.g. "VENDOR,SUPPLIER" or "SUBCONTRACTOR". */
  @IsOptional()
  @IsString()
  roles?: string;

  @IsOptional()
  @IsEnum(PartyStatus)
  status?: PartyStatus;

  @IsOptional()
  @IsString()
  categoryId?: string;

  @IsOptional()
  @IsString()
  district?: string;
}
