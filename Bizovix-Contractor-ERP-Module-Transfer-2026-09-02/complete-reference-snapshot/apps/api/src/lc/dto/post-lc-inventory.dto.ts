import { Type } from "class-transformer";
import { IsArray, IsIn, IsOptional, IsString, ValidateNested } from "class-validator";

export class PostLcInventoryItemDto {
  @IsString()
  lcItemId!: string;

  @IsString()
  warehouseId!: string;

  @IsOptional()
  @IsString()
  inventoryItemId?: string;

  @IsIn(["EXISTING", "NEW", "ONE_TIME"])
  postingType!: "EXISTING" | "NEW" | "ONE_TIME";
}

export class PostLcInventoryDto {
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => PostLcInventoryItemDto)
  items!: PostLcInventoryItemDto[];
}

export class UpdateLcInventoryPostingItemDto {
  @IsString()
  lcItemId!: string;

  @IsString()
  warehouseId!: string;

  @IsString()
  inventoryItemId!: string;
}

export class UpdateLcInventoryPostingDto {
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => UpdateLcInventoryPostingItemDto)
  items!: UpdateLcInventoryPostingItemDto[];
}
