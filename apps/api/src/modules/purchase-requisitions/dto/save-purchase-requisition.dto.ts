import { PrPriority } from "@bizovix/database";
import { Type } from "class-transformer";
import { ArrayMinSize, IsArray, IsDateString, IsEnum, IsNotEmpty, IsNumber, IsOptional, IsString, Min, ValidateNested } from "class-validator";

export class PrItemInputDto {
  @IsString()
  @IsNotEmpty()
  itemId!: string;

  @IsOptional()
  @IsString()
  uomId?: string;

  @Type(() => Number)
  @IsNumber()
  @Min(0.001)
  requestedQty!: number;

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  estimatedRate?: number;

  @IsOptional()
  @IsDateString()
  requiredDate?: string;

  @IsOptional()
  @IsString()
  boqItemId?: string;

  @IsOptional()
  @IsString()
  remarks?: string;
}

export class SavePurchaseRequisitionDto {
  @IsOptional()
  @IsString()
  prNo?: string;

  @IsDateString()
  requestDate!: string;

  @IsOptional()
  @IsDateString()
  requiredByDate?: string;

  @IsOptional()
  @IsString()
  cmsWorkId?: string;

  @IsOptional()
  @IsString()
  department?: string;

  @IsOptional()
  @IsString()
  requestedById?: string;

  @IsOptional()
  @IsEnum(PrPriority)
  priority?: PrPriority;

  @IsOptional()
  @IsString()
  purpose?: string;

  @IsOptional()
  @IsString()
  remarks?: string;

  @IsArray()
  @ArrayMinSize(1)
  @ValidateNested({ each: true })
  @Type(() => PrItemInputDto)
  items!: PrItemInputDto[];
}
