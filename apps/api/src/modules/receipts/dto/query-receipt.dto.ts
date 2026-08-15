import { IsDateString, IsIn, IsOptional, IsString } from "class-validator";
import { PaginationQueryDto } from "../../../common/dto/pagination-query.dto";

export class QueryReceiptDto extends PaginationQueryDto {
  @IsOptional() @IsDateString() dateFrom?: string = undefined;
  @IsOptional() @IsDateString() dateTo?: string = undefined;
  @IsOptional() @IsString() receiptType?: string;
  @IsOptional() @IsString() workId?: string;
  @IsOptional() @IsString() receivedInAccountId?: string;
  @IsOptional() @IsIn(["PENDING", "RECEIVED", "CANCELLED"]) status?: "PENDING" | "RECEIVED" | "CANCELLED";
}
