import { ContractStatus, ContractType } from "@bizovix/database";
import { Type } from "class-transformer";
import {
  IsDateString,
  IsEnum,
  IsInt,
  IsNotEmpty,
  IsNumber,
  IsOptional,
  IsString,
  Max,
  Min,
} from "class-validator";

export class CreateContractDto {
  @IsString()
  @IsNotEmpty()
  cmsWorkId!: string;

  @IsOptional()
  @IsString()
  tenderId?: string;

  @IsOptional()
  @IsString()
  pgBgWorkflowId?: string;

  @IsOptional()
  @IsEnum(ContractType)
  contractType?: ContractType;

  @IsString()
  @IsNotEmpty()
  contractNo!: string;

  @IsDateString()
  issueDate!: string;

  @IsOptional()
  @IsDateString()
  contractDate?: string;

  @Type(() => Number)
  @IsNumber()
  @Min(0.01)
  originalContractValue!: number;

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  currentContractValue?: number;

  @IsOptional()
  @IsString()
  currency?: string;

  @IsDateString()
  commencementDate!: string;

  @IsDateString()
  originalCompletionDate!: string;

  @IsOptional()
  @IsDateString()
  currentCompletionDate?: string;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  durationDays?: number;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  dlpDays?: number;

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  @Max(100)
  retentionPct?: number;

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  @Max(100)
  securityDepositPct?: number;

  @IsOptional()
  @IsString()
  clientContactName?: string;

  @IsOptional()
  @IsString()
  responsiblePerson?: string;

  @IsOptional()
  @IsString()
  scopeOfWork?: string;

  @IsOptional()
  @IsString()
  remarks?: string;

  @IsOptional()
  @IsEnum(ContractStatus)
  status?: ContractStatus;
}
