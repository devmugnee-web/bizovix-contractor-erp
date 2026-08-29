import { Type } from "class-transformer";
import { ArrayMaxSize, ArrayMinSize, IsArray, ValidateNested } from "class-validator";
import { SaveProjectExpenseDto } from "./save-project-expense.dto";

export class CreateProjectExpensesBatchDto {
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(50)
  @ValidateNested({ each: true })
  @Type(() => SaveProjectExpenseDto)
  expenses!: SaveProjectExpenseDto[];
}
