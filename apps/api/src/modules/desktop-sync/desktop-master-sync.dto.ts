import { Type } from "class-transformer";
import { IsDefined, IsIn, IsInt, IsObject, IsOptional, IsString, IsUUID, Matches, MaxLength, Min, ValidateNested } from "class-validator";
import { SaveUomDto } from "../uoms/dto/save-uom.dto";
import { SavePaymentTermDto } from "../payment-terms/dto/save-payment-term.dto";
import { CreateOrganizationMasterDto } from "../organizations/dto/create-organization-master.dto";
import type { DesktopMasterEntityType } from "./desktop-master-sync-state";

export class DesktopMasterQueryDto {
  @IsUUID() deviceId!: string;
  @IsIn(["uom", "paymentTerm", "organizationMaster"]) entityType!: DesktopMasterEntityType;
}

export class DesktopMasterChangesQueryDto extends DesktopMasterQueryDto {
  @IsString() @MaxLength(80) cursor!: string;
}

export class DesktopMasterCommandDto {
  @IsUUID() operationId!: string;
  @IsUUID() deviceId!: string;
  @IsIn([1]) schemaVersion!: 1;
  @IsIn(["uom", "paymentTerm", "organizationMaster"]) entityType!: DesktopMasterEntityType;
  @IsIn(["uom.create", "uom.update", "paymentTerm.create", "paymentTerm.update", "organizationMaster.create"])
  commandType!: "uom.create" | "uom.update" | "paymentTerm.create" | "paymentTerm.update" | "organizationMaster.create";
  @IsString() @Matches(/^[a-zA-Z0-9][a-zA-Z0-9:_-]{0,127}$/) entityId!: string;
  @IsOptional() @IsInt() @Min(1) expectedVersion?: number | null;
  @IsDefined() @IsObject() @ValidateNested()
  @Type((options) => options?.object?.entityType === "uom" ? SaveUomDto : options?.object?.entityType === "organizationMaster" ? CreateOrganizationMasterDto : SavePaymentTermDto)
  payload!: SaveUomDto | SavePaymentTermDto | CreateOrganizationMasterDto;
}
