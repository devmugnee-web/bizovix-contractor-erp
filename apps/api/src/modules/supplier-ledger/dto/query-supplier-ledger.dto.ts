import { IsDateString, IsNotEmpty, IsOptional, IsString } from "class-validator";

export class QuerySupplierLedgerDto {
  @IsString()
  @IsNotEmpty()
  supplierId!: string;

  @IsOptional()
  @IsDateString()
  dateFrom?: string;

  @IsOptional()
  @IsDateString()
  dateTo?: string;
}
