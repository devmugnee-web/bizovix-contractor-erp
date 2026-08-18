import { IsDateString, IsOptional, IsString } from "class-validator";

export class QueryApAgingDto {
  @IsOptional()
  @IsString()
  supplierId?: string;

  @IsOptional()
  @IsString()
  projectId?: string;

  @IsOptional()
  @IsDateString()
  asOf?: string;
}
