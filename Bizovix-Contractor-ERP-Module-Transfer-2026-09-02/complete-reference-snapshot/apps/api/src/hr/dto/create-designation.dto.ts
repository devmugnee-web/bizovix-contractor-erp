import { IsString, MinLength } from "class-validator";

export class CreateDesignationDto {
  @IsString()
  @MinLength(1)
  name!: string;
}
