import { Type } from "class-transformer";
import { ArrayMinSize, IsArray, IsNotEmpty, IsNumber, IsOptional, IsString, Min, ValidateNested } from "class-validator";

export class BudgetLineDto {
  @IsString()
  @IsNotEmpty()
  category!: string;

  @IsOptional()
  @IsString()
  description?: string;

  @Type(() => Number)
  @IsNumber()
  @Min(0)
  amount!: number;

  @IsOptional()
  @IsString()
  remarks?: string;
}

export class CreateProjectBudgetDto {
  @IsOptional()
  @IsString()
  revisionNote?: string;

  @IsArray()
  @ArrayMinSize(1)
  @ValidateNested({ each: true })
  @Type(() => BudgetLineDto)
  lines!: BudgetLineDto[];
}
