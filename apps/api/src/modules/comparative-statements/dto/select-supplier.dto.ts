import { IsNotEmpty, IsOptional, IsString } from "class-validator";

export class SelectSupplierDto {
  @IsString()
  @IsNotEmpty()
  supplierId!: string;

  /** Mandatory when the selected supplier is not the lowest evaluated offer — the explicit
   * commercial/technical decision the master task requires before any non-cheapest award. */
  @IsOptional()
  @IsString()
  decisionNotes?: string;
}
