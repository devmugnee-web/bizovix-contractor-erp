import { IsIn, IsInt, IsNumber, IsOptional, IsString, Min, MinLength } from "class-validator";

export class CreateAssetCategoryDto {
  @IsString()
  @MinLength(1)
  name!: string;

  @IsOptional()
  @IsString()
  code?: string;

  @IsOptional()
  @IsString()
  parentId?: string;

  @IsOptional()
  @IsInt()
  @Min(1)
  defaultUsefulLifeMonths?: number;

  @IsOptional()
  @IsNumber({ maxDecimalPlaces: 4 })
  @Min(0)
  defaultSalvageValue?: number;

  @IsOptional()
  @IsIn(["STRAIGHT_LINE"])
  defaultDepreciationMethod?: string;
}
