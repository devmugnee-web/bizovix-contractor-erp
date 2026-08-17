import { ContractStatus } from "@bizovix/database";
import { IsEnum, IsOptional, IsString } from "class-validator";
import { PaginationQueryDto } from "../../../common/dto/pagination-query.dto";

export class QueryContractDto extends PaginationQueryDto {
  @IsOptional()
  @IsString()
  organizationMasterId?: string;

  @IsOptional()
  @IsString()
  cmsWorkId?: string;

  @IsOptional()
  @IsString()
  workCategory?: string;

  @IsOptional()
  @IsEnum(ContractStatus)
  status?: ContractStatus;
}
