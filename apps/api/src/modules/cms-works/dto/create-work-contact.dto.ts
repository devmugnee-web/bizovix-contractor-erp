import { IsEmail, IsNotEmpty, IsOptional, IsString, ValidateIf } from "class-validator";

export class CreateWorkContactDto {
  @IsString() @IsNotEmpty() name!: string;
  @IsString() @IsNotEmpty() designation!: string;
  @IsString() @IsNotEmpty() mobile!: string;
  @ValidateIf((_object, value) => value !== "" && value !== undefined) @IsEmail() email?: string;
  @IsOptional() @IsString() address?: string;
}
