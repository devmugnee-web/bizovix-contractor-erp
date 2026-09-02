import { IsOptional, IsString } from "class-validator";

export class DecideLeaveRequestDto {
  @IsOptional()
  @IsString()
  note?: string;
}
