import { Type } from "class-transformer";
import { IsArray, IsBoolean, IsDateString, IsEnum, IsNumber, IsOptional, IsString, Min, ValidateNested } from "class-validator";

export enum WarehouseTypeDto {
  GENERAL = "GENERAL",
  RAW_MATERIAL = "RAW_MATERIAL",
  WIP = "WIP",
  FINISHED_GOODS = "FINISHED_GOODS",
  REJECTED = "REJECTED",
  SCRAP = "SCRAP",
  SHOWROOM = "SHOWROOM",
}

export class SaveWarehouseDto {
  @IsString() name!: string;
  @IsString() code!: string;
  @IsOptional() @IsString() address?: string;
  @IsOptional() @IsString() description?: string;
  @IsOptional() @IsEnum(WarehouseTypeDto) type?: WarehouseTypeDto;
  @IsOptional() @IsBoolean() allowGrn?: boolean;
  @IsOptional() @IsBoolean() allowSales?: boolean;
  @IsOptional() @IsBoolean() allowMaterialIssue?: boolean;
  @IsOptional() @IsBoolean() isDefault?: boolean;
  @IsOptional() @IsBoolean() isActive?: boolean;
}

export class WarehouseTransferLineDto {
  @IsString() inventoryItemId!: string;
  @IsNumber() @Min(0.0001) quantity!: number;
}

export class CreateWarehouseTransferDto {
  @IsString() workspaceId!: string;
  @IsOptional() @IsString() transferNo?: string;
  @IsDateString() transferDate!: string;
  @IsString() fromWarehouseId!: string;
  @IsString() toWarehouseId!: string;
  @IsOptional() @IsString() notes?: string;
  @IsArray() @ValidateNested({ each: true }) @Type(() => WarehouseTransferLineDto)
  lines!: WarehouseTransferLineDto[];
}
