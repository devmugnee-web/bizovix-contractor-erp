import { ItemStatus, ItemType } from "@bizovix/database";
import { Type } from "class-transformer";
import { IsEnum, IsNotEmpty, IsNumber, IsOptional, IsString, Min } from "class-validator";

export class SaveItemDto {
  /** Manual code override — validated for uniqueness if provided; otherwise auto-numbered. */
  @IsOptional()
  @IsString()
  itemCode?: string;

  @IsString()
  @IsNotEmpty()
  itemName!: string;

  @IsOptional()
  @IsString()
  description?: string;

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
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  defaultPurchaseRate?: number;

  @IsOptional()
  @IsString()
  preferredVendorId?: string;

  @IsOptional()
  @IsString()
  specification?: string;

  @IsOptional()
  @IsString()
  brandModel?: string;

  @IsOptional()
  @IsEnum(ItemStatus)
  status?: ItemStatus;
}
