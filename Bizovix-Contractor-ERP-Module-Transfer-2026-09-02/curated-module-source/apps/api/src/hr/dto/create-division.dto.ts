import { IsString, MinLength } from "class-validator";

export class CreateDivisionDto {
  @IsString()
  @MinLength(1)
  name!: string;
}
