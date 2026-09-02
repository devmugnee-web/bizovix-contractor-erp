import { IsInt, IsOptional, IsString, MinLength } from "class-validator";

export class CreateGradeDto {
  @IsString()
  @MinLength(1)
  name!: string;

  @IsOptional()
  @IsInt()
  level?: number;
}
