import { IsBoolean, IsNotEmpty, IsOptional, IsString } from "class-validator";

export class SaveUomDto {
  @IsString()
  @IsNotEmpty()
  code!: string;

  @IsString()
  @IsNotEmpty()
  name!: string;

  @IsOptional()
  @IsString()
  symbol?: string;

  @IsOptional()
  @IsBoolean()
  isActive?: boolean;
}
