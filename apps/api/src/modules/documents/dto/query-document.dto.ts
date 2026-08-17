import { IsOptional, IsString } from "class-validator";
import { PaginationQueryDto } from "../../../common/dto/pagination-query.dto";

export class QueryDocumentDto extends PaginationQueryDto {
  @IsOptional()
  @IsString()
  category?: string;

  @IsOptional()
  @IsString()
  relatedModule?: string;

  @IsOptional()
  @IsString()
  tenderId?: string;

  @IsOptional()
  @IsString()
  workId?: string;

  @IsOptional()
  @IsString()
  contractId?: string;

  @IsOptional()
  @IsString()
  projectBillId?: string;

  @IsOptional()
  @IsString()
  variationOrderId?: string;

  @IsOptional()
  @IsString()
  timeExtensionId?: string;

  @IsOptional()
  @IsString()
  status?: string;

  @IsOptional()
  @IsString()
  expiringWithinDays?: string;
}
