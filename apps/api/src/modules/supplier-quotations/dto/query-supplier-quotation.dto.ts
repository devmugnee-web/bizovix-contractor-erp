import { IsOptional, IsString } from "class-validator";

export class QuerySupplierQuotationDto {
  @IsOptional()
  @IsString()
  rfqId?: string;

  @IsOptional()
  @IsString()
  supplierId?: string;
}
