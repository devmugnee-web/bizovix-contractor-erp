import { IsDateString, IsNotEmpty, IsOptional, IsString } from "class-validator";
export class RequestPgBgReleaseDto {
  @IsDateString() releaseRequestDate!: string;
  @IsOptional() @IsString() remarks?: string;
}
export class CompletePgBgReleaseDto {
  @IsDateString() releaseDate!: string;
  @IsString() @IsNotEmpty() releaseReference!: string;
  @IsOptional() @IsString() bankConfirmation?: string;
  @IsOptional() @IsString() remarks?: string;
}
