import { Type } from "class-transformer";
import { IsInt, IsNotEmpty, IsString, Matches, MaxLength, Min } from "class-validator";

export class TenderCostingVersionDto {
  @Type(() => Number)
  @IsInt()
  @Min(1)
  version!: number;
}

export class RejectTenderCostingDto extends TenderCostingVersionDto {
  @IsString()
  @IsNotEmpty()
  @Matches(/\S/, { message: "Rejection reason must contain text" })
  @MaxLength(500)
  reason!: string;
}
