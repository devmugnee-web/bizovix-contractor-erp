import { IsIn, IsOptional } from "class-validator";
import { PaginationQueryDto } from "../../../common/dto/pagination-query.dto";

export class QueryBillSourceDto extends PaginationQueryDto {
  @IsOptional()
  @IsIn(["tenders", "projects"])
  kind?: "tenders" | "projects" = "tenders";
}
