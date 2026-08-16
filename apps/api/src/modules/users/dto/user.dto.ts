import { Type } from "class-transformer";
import { IsBoolean, IsEmail, IsIn, IsInt, IsOptional, IsString, Max, MaxLength, Min, MinLength } from "class-validator";

export class QueryUserDto {
  @IsOptional() @Type(() => Number) @IsInt() @Min(1) page?: number;
  @IsOptional() @Type(() => Number) @IsInt() @Min(1) @Max(100) limit?: number;
  @IsOptional() @IsString() search?: string;
  @IsOptional() @IsString() roleId?: string;
  @IsOptional() @IsIn(["true", "false"]) isActive?: string;
}

export class CreateUserDto {
  @IsString() @MinLength(2) @MaxLength(150) name!: string;
  @IsEmail() email!: string;
  @IsOptional() @IsString() @MaxLength(30) phone?: string;
  @IsString() roleId!: string;
  @IsOptional() @IsString() @MinLength(6) @MaxLength(72) password?: string;
}

export class UpdateUserDto {
  @IsOptional() @IsString() @MinLength(2) @MaxLength(150) name?: string;
  @IsOptional() @IsString() @MaxLength(30) phone?: string;
  @IsOptional() @IsString() roleId?: string;
}

export class SetUserStatusDto {
  @IsBoolean() isActive!: boolean;
}

export class ResetPasswordDto {
  @IsString() @MinLength(6) @MaxLength(72) newPassword!: string;
}
