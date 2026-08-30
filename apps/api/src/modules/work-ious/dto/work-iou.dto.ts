import { Type } from "class-transformer";
import {
  ArrayMaxSize,
  IsArray,
  IsDateString,
  IsEnum,
  IsInt,
  IsNotEmpty,
  IsOptional,
  IsString,
  Max,
  MaxLength,
  Matches,
  Min,
  ValidateIf,
  ValidateNested,
} from "class-validator";

export const WORK_IOU_MONEY_PATTERN = /^\d{1,16}(\.\d{1,2})?$/;

export enum WorkIouStatusDto {
  DRAFT = "DRAFT",
  SUBMITTED = "SUBMITTED",
  CANCELLED = "CANCELLED",
}

export enum WorkIouSettlementStatusDto {
  PENDING = "PENDING",
  PARTIALLY_SETTLED = "PARTIALLY_SETTLED",
  SETTLED = "SETTLED",
}

export enum WorkIouExpenseForDto {
  TENDER = "TENDER",
  PROJECT = "PROJECT",
}

export enum WorkIouPaymentMethodDto {
  CASH = "CASH",
  BANK_TRANSFER = "BANK_TRANSFER",
  CARD = "CARD",
  MOBILE_BANKING = "MOBILE_BANKING",
  CHEQUE = "CHEQUE",
  OTHER = "OTHER",
}

export class QueryWorkIouDto {
  @IsOptional() @Type(() => Number) @IsInt() @Min(1) page = 1;
  @IsOptional() @Type(() => Number) @IsInt() @Min(1) @Max(100) limit = 20;
  @IsOptional() @IsString() @MaxLength(100) search?: string;
  @IsOptional() @IsDateString() fromDate?: string;
  @IsOptional() @IsDateString() toDate?: string;
  @IsOptional() @IsEnum(WorkIouStatusDto) status?: WorkIouStatusDto;
  @IsOptional()
  @IsEnum(WorkIouSettlementStatusDto)
  settlementStatus?: WorkIouSettlementStatusDto;
  @IsOptional() @IsEnum(WorkIouExpenseForDto) expenseFor?: WorkIouExpenseForDto;
  @IsOptional() @IsEnum(WorkIouPaymentMethodDto) paymentMethod?: WorkIouPaymentMethodDto;
  @IsOptional() @IsString() tenderId?: string;
  @IsOptional() @IsString() workId?: string;
  @IsOptional() @IsString() paidById?: string;
}

export class WorkIouItemInputDto {
  @IsDateString() expenseDate!: string;
  @IsString() @IsNotEmpty() @Matches(/\S/, { message: "description must contain text" }) @MaxLength(500) description!: string;
  @IsString() @IsNotEmpty() expenseHeadId!: string;
  @IsString() @IsNotEmpty() @Matches(/\S/, { message: "paidToName must contain text" }) @MaxLength(200) paidToName!: string;
  @IsOptional() @IsString() @MaxLength(100) referenceNo?: string | null;
  @Matches(WORK_IOU_MONEY_PATTERN) amount!: string;
}

export class CreateWorkIouDto {
  @IsDateString() iouDate!: string;
  @IsDateString() paidOn!: string;
  @IsString() @IsNotEmpty() paidById!: string;
  @IsString() @IsNotEmpty() @Matches(/\S/, { message: "paidToName must contain text" }) @MaxLength(200) paidToName!: string;
  @IsEnum(WorkIouPaymentMethodDto) paymentMethod!: WorkIouPaymentMethodDto;
  @IsOptional() @IsString() @MaxLength(100) referenceNo?: string | null;
  @IsEnum(WorkIouExpenseForDto) expenseFor!: WorkIouExpenseForDto;
  @IsOptional() @IsString() tenderId?: string | null;
  @IsOptional() @IsString() workId?: string | null;
  @IsString() @IsNotEmpty() @Matches(/\S/, { message: "purpose must contain text" }) @MaxLength(1000) purpose!: string;
  @IsOptional() @IsString() @MaxLength(2000) remarks?: string | null;
  @ValidateIf((_object, value) => value !== undefined)
  @Matches(WORK_IOU_MONEY_PATTERN)
  otherCharges?: string;
  @ValidateIf((_object, value) => value !== undefined)
  @Matches(WORK_IOU_MONEY_PATTERN)
  discount?: string;
  @IsOptional() @IsDateString() expectedSettlementDate?: string | null;
  @IsOptional() @IsString() @MaxLength(1000) settlementRemarks?: string | null;
  @ValidateIf((_object, value) => value !== undefined)
  @IsArray()
  @ArrayMaxSize(200)
  @ValidateNested({ each: true })
  @Type(() => WorkIouItemInputDto)
  items?: WorkIouItemInputDto[];
}

export class UpdateWorkIouDto {
  @Type(() => Number) @IsInt() @Min(1) expectedVersion!: number;
  @ValidateIf((_object, value) => value !== undefined) @IsDateString() iouDate?: string;
  @ValidateIf((_object, value) => value !== undefined) @IsDateString() paidOn?: string;
  @ValidateIf((_object, value) => value !== undefined)
  @IsString()
  @IsNotEmpty()
  paidById?: string;
  @ValidateIf((_object, value) => value !== undefined)
  @IsString()
  @IsNotEmpty()
  @MaxLength(200)
  paidToName?: string;
  @ValidateIf((_object, value) => value !== undefined)
  @IsEnum(WorkIouPaymentMethodDto)
  paymentMethod?: WorkIouPaymentMethodDto;
  @IsOptional() @IsString() @MaxLength(100) referenceNo?: string | null;
  @ValidateIf((_object, value) => value !== undefined)
  @IsEnum(WorkIouExpenseForDto)
  expenseFor?: WorkIouExpenseForDto;
  @IsOptional() @IsString() tenderId?: string | null;
  @IsOptional() @IsString() workId?: string | null;
  @ValidateIf((_object, value) => value !== undefined)
  @IsString()
  @IsNotEmpty()
  @MaxLength(1000)
  purpose?: string;
  @IsOptional() @IsString() @MaxLength(2000) remarks?: string | null;
  @ValidateIf((_object, value) => value !== undefined)
  @Matches(WORK_IOU_MONEY_PATTERN)
  otherCharges?: string;
  @ValidateIf((_object, value) => value !== undefined)
  @Matches(WORK_IOU_MONEY_PATTERN)
  discount?: string;
  @IsOptional() @IsDateString() expectedSettlementDate?: string | null;
  @IsOptional() @IsString() @MaxLength(1000) settlementRemarks?: string | null;
  @ValidateIf((_object, value) => value !== undefined)
  @IsArray()
  @ArrayMaxSize(200)
  @ValidateNested({ each: true })
  @Type(() => WorkIouItemInputDto)
  items?: WorkIouItemInputDto[];
}

export class VersionedWorkIouActionDto {
  @Type(() => Number) @IsInt() @Min(1) expectedVersion!: number;
}

export class CancelWorkIouDto extends VersionedWorkIouActionDto {
  @IsString() @IsNotEmpty() @Matches(/\S/, { message: "cancellationReason must contain text" }) @MaxLength(500) cancellationReason!: string;
}
