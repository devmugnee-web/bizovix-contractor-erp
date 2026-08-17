import { Type } from "class-transformer";
import { IsNotEmpty, IsNumber, IsOptional, IsString, Min } from "class-validator";

export class CreateBoqItemDto {
  @IsOptional()
  @IsString()
  section?: string;

  @IsOptional()
  @IsString()
  itemCode?: string;

  @IsString()
  @IsNotEmpty()
  description!: string;

  @IsString()
  @IsNotEmpty()
  unit!: string;

  @Type(() => Number)
  @IsNumber()
  @Min(0)
  contractQty!: number;

  @Type(() => Number)
  @IsNumber()
  @Min(0)
  unitRate!: number;

  @IsOptional()
  @IsString()
  specification?: string;

  @IsOptional()
  @IsString()
  remarks?: string;
}
