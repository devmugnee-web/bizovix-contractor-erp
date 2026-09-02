import {
  ArrayUnique,
  IsArray,
  IsDateString,
  IsIn,
  IsNotEmpty,
  IsNumber,
  IsOptional,
  IsString,
  Min,
} from "class-validator";

export class PostManufacturingExecutionTransferDto {
  @IsString() @IsNotEmpty() workspaceId!: string;
  @IsIn(["WIP_TRANSFER", "BULK_PRODUCT_TRANSFER"])
  kind!: "WIP_TRANSFER" | "BULK_PRODUCT_TRANSFER";
  @IsString() @IsNotEmpty() orderId!: string;
  @IsString() @IsNotEmpty() orderLotId!: string;
  @IsString() @IsNotEmpty() operationExecutionId!: string;
  @IsString() @IsNotEmpty() sourceInventoryLotId!: string;
  @IsString() @IsNotEmpty() destinationLocationId!: string;
  @IsNumber() @Min(0.0001) quantity!: number;
  @IsOptional()
  @IsArray()
  @ArrayUnique()
  @IsString({ each: true })
  serialIds?: string[];
  @IsDateString() transactionDate!: string;
  @IsString() @IsNotEmpty() idempotencyKey!: string;
  @IsOptional() @IsString() note?: string | null;
  @IsOptional() @IsString() signatureMeaning?: string | null;
  @IsOptional() @IsString() reauthenticationPassword?: string | null;
}
