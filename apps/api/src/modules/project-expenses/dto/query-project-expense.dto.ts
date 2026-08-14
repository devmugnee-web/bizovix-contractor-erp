import { IsDateString, IsNotEmpty, IsOptional, IsString } from "class-validator";
import { PaginationQueryDto } from "../../../common/dto/pagination-query.dto";

export class QueryProjectExpenseDto extends PaginationQueryDto {
  @IsString() @IsNotEmpty() workId!: string;
  @IsOptional() @IsString() expenseHeadId?: string;
  @IsOptional() @IsString() expenseById?: string;
  @IsOptional() @IsString() paidFromAccountId?: string;
  @IsOptional() @IsDateString() override fromDate?: string = undefined;
  @IsOptional() @IsDateString() override toDate?: string = undefined;
}
