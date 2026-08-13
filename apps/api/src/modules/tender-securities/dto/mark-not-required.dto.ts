import { ArrayMinSize, IsArray, IsString } from "class-validator";

export class MarkTenderSecurityNotRequiredDto {
  @IsArray()
  @ArrayMinSize(1)
  @IsString({ each: true })
  documentPurchaseIds!: string[];
}
