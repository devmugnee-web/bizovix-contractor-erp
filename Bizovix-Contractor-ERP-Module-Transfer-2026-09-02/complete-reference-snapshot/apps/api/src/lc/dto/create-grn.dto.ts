import { Type } from "class-transformer";
import { IsArray, IsDateString, IsNumber, IsOptional, IsString, ValidateNested } from "class-validator";

export class LcGrnItemInputDto {
  @IsString()
  lcItemId!: string;

  @IsNumber()
  receivedQuantity!: number;

  @IsOptional()
  @IsNumber()
  damagedQuantity?: number;

  @IsOptional()
  @IsNumber()
  rejectedQuantity?: number;
}

export class CreateLcGrnDto {
  @IsOptional()
  @IsString()
  grnNumber?: string;

  @IsDateString()
  receivedDate!: string;

  @IsOptional()
  @IsString()
  warehouseId?: string;

  @IsOptional()
  @IsString()
  remarks?: string;

  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => LcGrnItemInputDto)
  items!: LcGrnItemInputDto[];
}
