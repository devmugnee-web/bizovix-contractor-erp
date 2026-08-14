import { PartialType } from "@nestjs/mapped-types";
import { SaveProjectExpenseDto } from "./save-project-expense.dto";

export class UpdateProjectExpenseDto extends PartialType(SaveProjectExpenseDto) {}
