import { TenderCostingStatus } from "@bizovix/database";
import { Type } from "class-transformer";
import {
  ArrayMaxSize,
  IsArray,
  IsDateString,
  IsEnum,
  IsInt,
  IsIn,
  IsNotEmpty,
  IsNumber,
  IsOptional,
  IsString,
  Matches,
  Max,
  MaxLength,
  Min,
  ValidateNested,
} from "class-validator";
import { PaginationQueryDto } from "../../../common/dto/pagination-query.dto";

export class QueryTenderCostingDto extends PaginationQueryDto {
  @IsOptional()
  @IsEnum(TenderCostingStatus)
  status?: TenderCostingStatus;

  @IsOptional()
  @IsString()
  organizationMasterId?: string;

  @IsOptional()
  @IsString()
  assignedToUserId?: string;
}

export class TenderCostingItemInputDto {
  @IsDateString()
  costingDate!: string;

  @IsOptional()
  @IsString()
  @MaxLength(100)
  preparedByUserId?: string | null;

  @IsString()
  @IsNotEmpty()
  @Matches(/\S/, { message: "Item description must contain text" })
  @MaxLength(500)
  description!: string;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  secondaryDescription?: string | null;

  @IsString()
  @IsNotEmpty()
  @Matches(/\S/, { message: "Unit must contain text" })
  @MaxLength(50)
  unit!: string;

  @Type(() => Number)
  @IsNumber()
  @Min(0.001)
  quantity!: number;

  @Type(() => Number)
  @IsOptional()
  @IsNumber()
  @Min(0)
  unitCost?: number;

  @Type(() => Number)
  @IsOptional()
  @IsNumber()
  @Min(0)
  @Max(100)
  marginPercent?: number;

  @IsString()
  @IsIn(["LOCAL", "FOREIGN", "LOCAL_AND_FOREIGN"])
  sourcingType!: "LOCAL" | "FOREIGN" | "LOCAL_AND_FOREIGN";

  @IsString()
  @IsIn(["NOT_COSTED", "DRAFT", "COSTED"])
  costingStatus!: "NOT_COSTED" | "DRAFT" | "COSTED";

  @IsOptional()
  @IsString()
  @IsIn(["LOCAL", "FOREIGN"])
  selectedSource?: "LOCAL" | "FOREIGN" | null;

  @IsOptional()
  @IsString()
  @MaxLength(200)
  localSupplierName?: string | null;

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  localUnitPrice?: number;

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  @Max(100)
  localDiscountPercent?: number;

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  @Max(100)
  localVatPercent?: number;

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  @Max(100)
  localTaxPercent?: number;

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  localTransportCost?: number;

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  localOtherCost?: number;

  @IsOptional()
  @IsString()
  @MaxLength(200)
  foreignSupplierName?: string | null;

  @IsOptional()
  @IsString()
  @MaxLength(100)
  foreignCountry?: string | null;

  @IsOptional()
  @IsString()
  @MaxLength(10)
  foreignCurrency?: string;

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  foreignUnitPrice?: number;

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0.000001)
  foreignExchangeRate?: number;

  @IsOptional()
  @IsDateString()
  exchangeRateDate?: string | null;

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  foreignFreightCost?: number;

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  foreignInsuranceCost?: number;

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  @Max(100)
  customsDutyPercent?: number;

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  @Max(100)
  regulatoryDutyPercent?: number;

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  @Max(100)
  supplementaryDutyPercent?: number;

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  @Max(100)
  foreignVatPercent?: number;

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  @Max(100)
  foreignTaxPercent?: number;

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  cnfCharge?: number;

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  portHandlingCharge?: number;

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  bankLcCharge?: number;

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  foreignLocalTransportCost?: number;

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  foreignOtherCost?: number;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  remarks?: string | null;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  sortOrder?: number;
}

export class SetTenderCostingBudgetDto {
  @Type(() => Number)
  @IsInt()
  @Min(1)
  version!: number;

  @Type(() => Number)
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0.01)
  costingBudget!: number;
}

export class SaveTenderCostingDto {
  @Type(() => Number)
  @IsInt()
  @Min(1)
  version!: number;

  @IsEnum(TenderCostingStatus)
  status!: TenderCostingStatus;

  @IsDateString()
  costingDate!: string;

  @IsOptional()
  @IsString()
  @MaxLength(100)
  source?: string | null;

  @IsString()
  @IsNotEmpty()
  @MaxLength(10)
  currency!: string;

  @Type(() => Number)
  @IsNumber()
  @Min(0.000001)
  exchangeRate!: number;

  @Type(() => Number)
  @IsInt()
  @Min(1)
  costingVersion!: number;

  @IsOptional()
  @IsString()
  @MaxLength(2000)
  remarks?: string | null;

  @IsOptional()
  @IsString()
  preparedByUserId?: string | null;

  @IsOptional()
  @IsString()
  @MaxLength(200)
  preparedByName?: string | null;

  @Type(() => Number)
  @IsNumber()
  @Min(0)
  freightCost!: number;

  @Type(() => Number)
  @IsNumber()
  @Min(0)
  installationCost!: number;

  @Type(() => Number)
  @IsNumber()
  @Min(0)
  otherCost!: number;

  @Type(() => Number)
  @IsNumber()
  @Min(0)
  @Max(100)
  contingencyPercent!: number;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(3650)
  validityDays?: number | null;

  @IsOptional()
  @IsString()
  paymentTermId?: string | null;

  @IsOptional()
  @IsString()
  @MaxLength(200)
  deliveryTime?: string | null;

  @IsOptional()
  @IsString()
  @MaxLength(200)
  warranty?: string | null;

  @IsOptional()
  @IsString()
  assignedToUserId?: string | null;

  @IsOptional()
  @IsString()
  @MaxLength(200)
  assignedToName?: string | null;

  @IsArray()
  @ArrayMaxSize(200)
  @ValidateNested({ each: true })
  @Type(() => TenderCostingItemInputDto)
  items!: TenderCostingItemInputDto[];
}
