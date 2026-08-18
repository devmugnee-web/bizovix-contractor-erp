import { MasterCategoryType } from "@bizovix/database";
import { IsEnum, IsOptional } from "class-validator";

export class QueryMasterCategoryDto {
  @IsOptional()
  @IsEnum(MasterCategoryType)
  type?: MasterCategoryType;
}
