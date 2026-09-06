import { DocumentPurchaseRequestStatus } from "@bizovix/database";
import { IsEnum, IsInt, IsNotEmpty, IsOptional, IsString, Min } from "class-validator";
import { Type } from "class-transformer";
import { PaginationQueryDto } from "../../../common/dto/pagination-query.dto";

export class QueryDocumentPurchaseRequestDto extends PaginationQueryDto {
  @IsOptional()
  @IsEnum(DocumentPurchaseRequestStatus)
  status?: DocumentPurchaseRequestStatus;
}

export class DocumentPurchaseRequestActionDto {
  @Type(() => Number)
  @IsInt()
  @Min(1)
  version!: number;
}

export class RejectDocumentPurchaseRequestDto extends DocumentPurchaseRequestActionDto {
  @IsString()
  @IsNotEmpty()
  reason!: string;
}
