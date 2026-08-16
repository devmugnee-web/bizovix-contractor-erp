import { IsBoolean, IsObject, IsOptional } from "class-validator";

export class UpdateSystemSettingDto {
  @IsBoolean() maintenanceMode!: boolean;
  @IsOptional() @IsObject() featureToggles?: Record<string, boolean>;
}
