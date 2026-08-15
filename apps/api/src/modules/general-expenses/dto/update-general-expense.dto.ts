import { PartialType } from "@nestjs/mapped-types";
import { SaveGeneralExpenseDto } from "./save-general-expense.dto";

export class UpdateGeneralExpenseDto extends PartialType(SaveGeneralExpenseDto) {}
