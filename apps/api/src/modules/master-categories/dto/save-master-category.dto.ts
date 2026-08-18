import { MasterCategoryType } from "@bizovix/database";
import { IsBoolean, IsEnum, IsNotEmpty, IsOptional, IsString } from "class-validator";

export class SaveMasterCategoryDto {
  @IsEnum(MasterCategoryType)
  type!: MasterCategoryType;

  @IsString()
  @IsNotEmpty()
  name!: string;

  @IsOptional()
  @IsString()
  description?: string;

  @IsOptional()
  @IsBoolean()
  isActive?: boolean;
}
