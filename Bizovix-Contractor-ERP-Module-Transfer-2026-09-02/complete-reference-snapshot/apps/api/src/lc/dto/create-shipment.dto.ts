import { IsDateString, IsIn, IsOptional, IsString } from "class-validator";

export class CreateLcShipmentDto {
  @IsOptional()
  @IsString()
  @IsIn(["SEA", "AIR", "ROAD", "RAIL", "COURIER", "MULTIMODAL"])
  transportMode?: string;

  @IsOptional()
  @IsString()
  shipmentNumber?: string;

  @IsOptional()
  @IsString()
  blAwbNumber?: string;

  @IsOptional()
  @IsDateString()
  etd?: string;

  @IsOptional()
  @IsDateString()
  eta?: string;

  @IsOptional()
  @IsString()
  containerNumber?: string;

  @IsOptional()
  @IsString()
  forwarderName?: string;

  @IsOptional()
  @IsString()
  shippingLine?: string;

  @IsOptional()
  @IsString()
  remarks?: string;
}
