import { PartyStatus } from "@bizovix/database";
import { IsEnum, IsOptional, IsString } from "class-validator";

export class ChangePartyStatusDto {
  @IsEnum(PartyStatus)
  status!: PartyStatus;

  @IsOptional()
  @IsString()
  reason?: string;
}
