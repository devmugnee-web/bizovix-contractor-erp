import { Type } from "class-transformer";
import { ArrayMinSize, IsArray, IsDateString, IsNotEmpty, IsNumber, IsOptional, IsPositive, IsString, ValidateNested } from "class-validator";

export class CreateCreditCommitmentItemDto {
  @IsString()
  @IsNotEmpty()
  documentPurchaseId!: string;

  @IsString()
  @IsNotEmpty()
  bankAccountId!: string;

  @Type(() => Number)
  @IsNumber()
  @IsPositive()
  chargeAmount!: number;

  @IsOptional()
  @IsString()
  remarks?: string;
}

export class CreateCreditCommitmentDto {
  @IsString()
  @IsNotEmpty()
  paymentFromAccountId!: string;

  @IsDateString()
  paymentDate!: string;

  @IsOptional()
  @IsString()
  remarks?: string;

  @IsArray()
  @ArrayMinSize(1)
  @ValidateNested({ each: true })
  @Type(() => CreateCreditCommitmentItemDto)
  items!: CreateCreditCommitmentItemDto[];
}
