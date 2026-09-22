import { Type } from "class-transformer";
import { IsDefined, IsIn, IsInt, IsObject, IsOptional, IsString, IsUUID, Matches, MaxLength, Min, ValidateNested } from "class-validator";
import { SaveMasterCategoryDto } from "../master-categories/dto/save-master-category.dto";

export class RegisterDesktopDto {
  @IsUUID() deviceId!: string;
  @IsOptional() @IsString() @MaxLength(200) deviceName?: string;
}

export class DesktopSyncQueryDto {
  @IsUUID() deviceId!: string;
}

export class DesktopChangesQueryDto extends DesktopSyncQueryDto {
  @IsString() @MaxLength(80) cursor!: string;
}

export class DesktopCategoryCommandDto {
  @IsUUID() operationId!: string;
  @IsUUID() deviceId!: string;
  @IsIn([1]) schemaVersion!: 1;
  @IsIn(["masterCategory.create", "masterCategory.update"])
  commandType!: "masterCategory.create" | "masterCategory.update";
  @IsString() @Matches(/^[a-zA-Z0-9][a-zA-Z0-9:_-]{0,127}$/) entityId!: string;
  @IsOptional() @IsInt() @Min(1) expectedVersion?: number | null;
  @IsDefined() @IsObject() @ValidateNested() @Type(() => SaveMasterCategoryDto) payload!: SaveMasterCategoryDto;
}
