import { IsIn, IsString } from "class-validator";

const businessCategoryCodes = ["TRADING", "TENDER", "RENTAL", "SERVICE"] as const;

export class SelectBusinessCategoryDto {
  @IsString()
  @IsIn(businessCategoryCodes)
  businessCategoryCode!: (typeof businessCategoryCodes)[number];
}
