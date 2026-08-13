import { PartialType } from "@nestjs/mapped-types";
import { CreateDocumentPurchaseDto } from "./create-document-purchase.dto";

export class UpdateDocumentPurchaseDto extends PartialType(CreateDocumentPurchaseDto) {}
