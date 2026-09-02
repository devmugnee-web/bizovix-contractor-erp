import { IsOptional, IsString } from "class-validator";

export class DecideExpenseClaimDto {
  @IsOptional()
  @IsString()
  note?: string;
}
