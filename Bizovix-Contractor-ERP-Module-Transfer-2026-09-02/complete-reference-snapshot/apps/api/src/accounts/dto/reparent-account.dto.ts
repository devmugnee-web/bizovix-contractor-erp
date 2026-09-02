import { IsOptional, IsString } from "class-validator";

export class ReparentAccountDto {
  @IsOptional()
  @IsString()
  parentId?: string | null;
}
