import { Type } from "class-transformer";
import {
  IsArray,
  IsBoolean,
  IsDateString,
  IsIn,
  IsNumber,
  IsOptional,
  IsPositive,
  IsString,
  Max,
  Min,
  ValidateNested,
} from "class-validator";
export class QueryAccountingDto {
  @IsOptional() @Type(() => Number) @Min(1) page?: number;
  @IsOptional() @Type(() => Number) @Min(1) @Max(100) limit?: number;
  @IsOptional() @IsDateString() dateFrom?: string;
  @IsOptional() @IsDateString() dateTo?: string;
  @IsOptional() @IsString() accountId?: string;
  @IsOptional() @IsString() projectId?: string;
  @IsOptional() @IsString() party?: string;
  @IsOptional() @IsString() status?: string;
  @IsOptional() @IsString() sourceModule?: string;
  @IsOptional() @IsString() search?: string;
}
export class CreateAccountDto {
  @IsString() code!: string;
  @IsString() name!: string;
  @IsOptional() @IsString() parentId?: string;
  @IsIn(["ASSET", "LIABILITY", "INCOME", "EXPENSE", "EQUITY"]) accountType!: string;
  @IsIn(["DEBIT", "CREDIT"]) normalBalance!: string;
  @IsOptional() @IsString() description?: string;
  @IsOptional() @IsBoolean() isActive?: boolean;
}
export class JournalLineDto {
  @IsString() accountId!: string;
  @Type(() => Number) @IsNumber() debit!: number;
  @Type(() => Number) @IsNumber() credit!: number;
  @IsOptional() @IsString() projectId?: string;
  @IsOptional() @IsString() partyName?: string;
  @IsOptional() @IsString() partyType?: string;
  @IsOptional() @IsString() description?: string;
}
export class CreateJournalDto {
  @IsDateString() journalDate!: string;
  @IsOptional() @IsString() referenceNo?: string;
  @IsString() description!: string;
  @IsArray() @ValidateNested({ each: true }) @Type(() => JournalLineDto) lines!: JournalLineDto[];
  @IsOptional() @IsBoolean() post?: boolean;
}
export class CreatePayableDto {
  @IsOptional() @IsString() partyId?: string;
  @IsString() partyName!: string;
  @IsOptional() @IsString() partyType?: string;
  @IsOptional() @IsString() projectId?: string;
  @IsString() billNo!: string;
  @IsDateString() billDate!: string;
  @Type(() => Number) @IsPositive() amount!: number;
  @IsOptional() @IsDateString() dueDate?: string;
  @IsOptional() @IsString() description?: string;
}
export class PayPayableDto {
  @IsString() accountId!: string;
  @Type(() => Number) @IsPositive() amount!: number;
  @IsDateString() paymentDate!: string;
  @IsOptional() @IsString() referenceNo?: string;
}
export class OpeningBalanceDto {
  @IsDateString() openingDate!: string;
  @IsOptional() @IsString() referenceNo?: string;
  @IsString() description!: string;
  @IsArray() @ValidateNested({ each: true }) @Type(() => JournalLineDto) lines!: JournalLineDto[];
}
