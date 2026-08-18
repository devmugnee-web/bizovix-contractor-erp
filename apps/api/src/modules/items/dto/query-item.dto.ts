import { ItemStatus, ItemType } from "@bizovix/database";
import { IsEnum, IsOptional, IsString } from "class-validator";
import { PaginationQueryDto } from "../../../common/dto/pagination-query.dto";

export class QueryItemDto extends PaginationQueryDto {
  @IsOptional()
  @IsEnum(ItemType)
  itemType?: ItemType;

  @IsOptional()
  @IsString()
  categoryId?: string;

  @IsOptional()
  @IsString()
  uomId?: string;

  @IsOptional()
  @IsEnum(ItemStatus)
  status?: ItemStatus;
}
