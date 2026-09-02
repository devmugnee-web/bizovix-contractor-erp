import { Type } from "class-transformer";
import { ArrayMinSize, IsArray, IsIn, IsNumber, IsUUID, ValidateNested } from "class-validator";

export class LcProfitRowDto {
  @IsUUID()
  lcItemId!: string;

  @IsIn(["PERCENTAGE", "FIXED"])
  profitMode!: "PERCENTAGE" | "FIXED";

  @IsNumber()
  profitValue!: number;
}

export class UpdateLcProfitDto {
  @IsArray()
  @ArrayMinSize(1)
  @ValidateNested({ each: true })
  @Type(() => LcProfitRowDto)
  items!: LcProfitRowDto[];
}
