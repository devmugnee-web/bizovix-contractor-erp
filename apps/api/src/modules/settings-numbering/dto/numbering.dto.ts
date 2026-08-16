import { IsBoolean, IsIn, IsInt, IsString, Max, MaxLength, Min, MinLength } from "class-validator";

export class UpdateNumberSequenceDto {
  @IsString() @MinLength(1) @MaxLength(10) prefix!: string;
  @IsBoolean() includeYear!: boolean;
  @IsIn(["YYYY", "YY"]) yearFormat!: string;
  @IsString() @MaxLength(3) separator!: string;
  @IsInt() @Min(1) @Max(10) sequenceLength!: number;
  @IsInt() @Min(1) nextNumber!: number;
}
