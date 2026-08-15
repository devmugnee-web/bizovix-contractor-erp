import { PartialType } from "@nestjs/mapped-types";
import { SaveReceiptDto } from "./save-receipt.dto";
export class UpdateReceiptDto extends PartialType(SaveReceiptDto) {}
