import { IsNotEmpty, IsString, MaxLength } from "class-validator";

export class CreateOrganizationMasterDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(50)
  shortName!: string;

  @IsString()
  @IsNotEmpty()
  @MaxLength(200)
  fullName!: string;
}
