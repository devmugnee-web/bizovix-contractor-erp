import { Type } from "class-transformer";
import { IsBoolean, IsDateString, IsEmail, IsEnum, IsInt, IsNotEmpty, IsNumber, IsOptional, IsPositive, IsString, Max, Min, ValidateIf, ValidateNested } from "class-validator";
import { GuaranteeType } from "@bizovix/database";

export class OrganizationContactDto {
  @IsOptional() @IsString() name?: string;
  @IsOptional() @IsString() designation?: string;
  @IsOptional() @IsString() mobile?: string;
  @ValidateIf((_object, value) => value !== "" && value !== undefined) @IsEmail() email?: string;
  @IsOptional() @IsString() address?: string;
}

export class SavePgBgWorkflowDto {
  @IsString()
  @IsNotEmpty()
  documentPurchaseId!: string;

  @IsOptional() @IsDateString() noaDate?: string;
  @IsOptional() @Type(() => Number) @IsNumber() @IsPositive() noaAmount?: number;
  @IsOptional() @IsString() workCategory?: string;
  @IsOptional() @ValidateNested() @Type(() => OrganizationContactDto) contact?: OrganizationContactDto;
  @IsOptional() @IsBoolean() acceptNoa?: boolean;
  @IsOptional() @IsBoolean() pgBgRequired?: boolean;
  @IsOptional() @Type(() => Number) @IsInt() @Min(1) @Max(5) currentStep?: number;
}

export class AcceptNoaDto {
  @IsBoolean()
  acceptNoa!: boolean;

  @IsBoolean()
  pgBgRequired!: boolean;
}

export class FinalizePgBgDto {
  @IsEnum(GuaranteeType) type!: GuaranteeType;
  @IsString() @IsNotEmpty() bankAccountId!: string;
  @IsOptional() @IsString() instrumentNo?: string;
  @Type(() => Number) @IsNumber() @IsPositive() amount!: number;
  @IsDateString() issueDate!: string;
  @IsDateString() expiryDate!: string;
}
