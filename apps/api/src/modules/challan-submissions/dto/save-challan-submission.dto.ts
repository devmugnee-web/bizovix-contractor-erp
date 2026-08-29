import { PartialType } from "@nestjs/mapped-types";
import { Type } from "class-transformer";
import {
  IsArray,
  IsDateString,
  IsInt,
  IsNotEmpty,
  IsNumber,
  IsOptional,
  IsString,
  Matches,
  Min,
  ValidateNested,
} from "class-validator";

export class ChallanSubmissionItemInputDto {
  @IsOptional()
  @IsString()
  itemCode?: string;

  @IsString()
  @IsNotEmpty()
  @Matches(/\S/)
  description!: string;

  @IsString()
  @IsNotEmpty()
  @Matches(/\S/)
  unit!: string;

  @Type(() => Number)
  @IsNumber()
  @Min(0.001)
  quantity!: number;

  @Type(() => Number)
  @IsNumber()
  @Min(0.01)
  rate!: number;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  sortOrder?: number;
}

export class SaveChallanSubmissionDto {
  @IsString()
  @IsNotEmpty()
  @Matches(/\S/)
  cmsWorkId!: string;

  @IsOptional()
  @IsString()
  contractId?: string | null;

  @IsDateString()
  challanDate!: string;

  @IsString()
  @IsNotEmpty()
  @Matches(/\S/)
  description!: string;

  @IsString()
  @IsNotEmpty()
  @Matches(/\S/)
  challanType!: string;

  @IsDateString()
  challanMonth!: string;

  @IsDateString()
  periodFrom!: string;

  @IsDateString()
  periodTo!: string;

  @IsString()
  @IsNotEmpty()
  @Matches(/\S/)
  receivedBy!: string;

  @IsString()
  @IsNotEmpty()
  @Matches(/\S/)
  receivedAt!: string;

  @IsString()
  @IsNotEmpty()
  @Matches(/\S/)
  submittedTo!: string;

  @IsString()
  @IsNotEmpty()
  @Matches(/\S/)
  paymentFrom!: string;

  @IsOptional()
  @IsString()
  remarks?: string;

  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => ChallanSubmissionItemInputDto)
  items?: ChallanSubmissionItemInputDto[];
}

export class UpdateChallanSubmissionDto extends PartialType(SaveChallanSubmissionDto) {}
