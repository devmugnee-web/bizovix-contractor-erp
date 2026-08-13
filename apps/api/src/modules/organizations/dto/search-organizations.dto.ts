import { IsOptional, IsString } from "class-validator";

export class SearchOrganizationsDto {
  @IsOptional()
  @IsString()
  search?: string;
}
