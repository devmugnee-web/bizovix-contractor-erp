import { IsIn, IsOptional, IsString } from "class-validator";

const STATUSES = [
  "DRAFT",
  "ACTIVE",
  "COSTING_PENDING",
  "ALLOCATION_PENDING",
  "READY_TO_FINALIZE",
  "FINALIZED",
  "CLOSED",
  "CANCELLED",
] as const;

export class SetLcStatusDto {
  @IsIn(STATUSES)
  status!: (typeof STATUSES)[number];

  @IsOptional()
  @IsString()
  reason?: string;
}
