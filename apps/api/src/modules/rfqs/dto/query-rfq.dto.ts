import { RfqStatus } from "@bizovix/database";
import { IsEnum, IsOptional, IsString } from "class-validator";
import { PaginationQueryDto } from "../../../common/dto/pagination-query.dto";

export class QueryRfqDto extends PaginationQueryDto {
  @IsOptional()
  @IsEnum(RfqStatus)
  status?: RfqStatus;

  @IsOptional()
  @IsString()
  purchaseRequisitionId?: string;
}
