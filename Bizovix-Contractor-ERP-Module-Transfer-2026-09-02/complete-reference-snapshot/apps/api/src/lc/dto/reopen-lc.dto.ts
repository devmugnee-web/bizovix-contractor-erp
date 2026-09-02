import { IsString } from "class-validator";

export class ReopenLcLandedCostDto {
  @IsString()
  reason!: string;
}
