import { IsBoolean, IsIn, IsOptional, IsString, MinLength } from "class-validator";

const expenseNatures = ["DIRECT_EXPENSE", "INDIRECT_EXPENSE"] as const;

export class CreateExpenseLedgerDto {
  @IsString()
  @MinLength(1)
  name!: string;

  @IsIn(expenseNatures)
  nature!: (typeof expenseNatures)[number];

  @IsOptional()
  @IsBoolean()
  requiresItemDetails?: boolean;
}
