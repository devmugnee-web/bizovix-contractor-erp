import { IsEmail, IsNotEmpty, IsOptional, IsString } from "class-validator";

export class SavePartyContactDto {
  /** Free-text tag such as "Primary" | "Accounts" | "Sales" | "Technical". */
  @IsOptional()
  @IsString()
  contactRole?: string;

  @IsString()
  @IsNotEmpty()
  name!: string;

  @IsString()
  @IsNotEmpty()
  designation!: string;

  @IsString()
  @IsNotEmpty()
  mobile!: string;

  @IsOptional()
  @IsEmail()
  email?: string;

  @IsString()
  @IsNotEmpty()
  address!: string;
}
