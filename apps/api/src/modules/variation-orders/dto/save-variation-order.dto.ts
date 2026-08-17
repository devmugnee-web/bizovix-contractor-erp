import { VariationType } from "@bizovix/database";
import { Type } from "class-transformer";
import { ArrayMinSize, IsArray, IsDateString, IsEnum, IsNotEmpty, IsNumber, IsOptional, IsString, Min, ValidateNested } from "class-validator";

export class VariationItemInputDto {
  @IsOptional()
  @IsString()
  boqItemId?: string;

  @IsOptional()
  @IsString()
  itemCode?: string;

  @IsString()
  @IsNotEmpty()
  description!: string;

  @IsOptional()
  @IsString()
  unit?: string;

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  revisedQty?: number;

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  revisedRate?: number;
}

export class SaveVariationOrderDto {
  @IsString()
  @IsNotEmpty()
  contractId!: string;

  @IsEnum(VariationType)
  variationType!: VariationType;

  @IsString()
  @IsNotEmpty()
  title!: string;

  @IsString()
  @IsNotEmpty()
  reason!: string;

  @IsOptional()
  @IsString()
  description?: string;

  @IsDateString()
  requestDate!: string;

  @IsArray()
  @ArrayMinSize(1)
  @ValidateNested({ each: true })
  @Type(() => VariationItemInputDto)
  items!: VariationItemInputDto[];
}

export class ApproveVariationOrderDto {
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  approvedAmount?: number;
}
