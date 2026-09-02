import { IsIn, IsOptional, IsString } from "class-validator";

export class ListDayBookDto {
  @IsOptional()
  @IsString()
  workspaceId?: string;

  @IsOptional()
  @IsString()
  from?: string;

  @IsOptional()
  @IsString()
  to?: string;

  @IsOptional()
  @IsString()
  @IsIn(["contra", "payment", "receipt", "journal", "sales", "purchase", "expense", "revenue", "credit-note", "debit-note", "all"])
  voucherType?: string;

  @IsOptional()
  @IsString()
  @IsIn(["draft", "pending", "approved", "posted", "cancelled", "all"])
  status?: string;

  @IsOptional()
  @IsString()
  query?: string;
}
