import { FundingType, SecurityType } from "@bizovix/database";
import { Type } from "class-transformer";
import {
  ArrayMinSize,
  IsArray,
  IsDateString,
  IsEnum,
  IsNotEmpty,
  IsNumber,
  IsOptional,
  IsPositive,
  IsString,
  Min,
  ValidateNested,
} from "class-validator";

export class CreateTenderSecurityItemDto {
  @IsString()
  @IsNotEmpty()
  documentPurchaseId!: string;

  @Type(() => Number)
  @IsNumber()
  @IsPositive()
  securityAmount!: number;

  @Type(() => Number)
  @IsNumber()
  @Min(0)
  marginPercentage!: number;

  @IsOptional()
  @IsString()
  referenceNo?: string;
}

export class CreateTenderSecurityDto {
  @IsEnum(SecurityType)
  securityType!: SecurityType;

  @IsString()
  @IsNotEmpty()
  bankId!: string;

  @IsEnum(FundingType)
  fundingType!: FundingType;

  @IsDateString()
  issueDate!: string;

  @Type(() => Number)
  @IsNumber()
  @IsPositive()
  validityMonths!: number;

  @IsDateString()
  expiryDate!: string;

  @Type(() => Number)
  @IsNumber()
  @Min(0)
  interestRate!: number;

  @IsString()
  @IsNotEmpty()
  chargeFromAccountId!: string;

  @IsOptional()
  @IsString()
  remarks?: string;

  @IsArray()
  @ArrayMinSize(1)
  @ValidateNested({ each: true })
  @Type(() => CreateTenderSecurityItemDto)
  items!: CreateTenderSecurityItemDto[];
}
