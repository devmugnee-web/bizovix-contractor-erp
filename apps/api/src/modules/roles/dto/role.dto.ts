import { ArrayUnique, IsArray, IsOptional, IsString, MaxLength, MinLength } from "class-validator";

export class CreateRoleDto {
  @IsString() @MinLength(2) @MaxLength(80) name!: string;
  @IsOptional() @IsString() @MaxLength(300) description?: string;
  @IsOptional() @IsArray() @ArrayUnique() @IsString({ each: true }) permissionKeys?: string[];
}

export class UpdateRoleDto {
  @IsOptional() @IsString() @MinLength(2) @MaxLength(80) name?: string;
  @IsOptional() @IsString() @MaxLength(300) description?: string;
}

export class SetRolePermissionsDto {
  @IsArray() @ArrayUnique() @IsString({ each: true }) permissionKeys!: string[];
}
