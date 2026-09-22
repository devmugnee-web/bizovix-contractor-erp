import { FundingType, SecurityType } from "@bizovix/database";
import { Transform, Type } from "class-transformer";
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
  Max,
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
  @Max(100)
  marginPercentage!: number;

  @Transform(({ value }: { value: unknown }) => typeof value === "string" ? value.trim() : value)
  @IsString()
  @IsNotEmpty({ message: "Reference No. (PO/BG No.) is required for each tender" })
  referenceNo!: string;
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
