import { Type } from "class-transformer";
import { IsDateString, IsOptional, IsString, Max, Min } from "class-validator";
export class QueryReportDto {
  @IsOptional() @Type(()=>Number) @Min(1) page?:number;
  @IsOptional() @Type(()=>Number) @Min(1) @Max(100) limit?:number;
  @IsOptional() @IsDateString() dateFrom?:string;
  @IsOptional() @IsDateString() dateTo?:string;
  @IsOptional() @IsString() search?:string;
  @IsOptional() @IsString() organizationMasterId?:string;
  @IsOptional() @IsString() workId?:string;
  @IsOptional() @IsString() category?:string;
  @IsOptional() @IsString() status?:string;
  @IsOptional() @IsString() accountId?:string;
}
