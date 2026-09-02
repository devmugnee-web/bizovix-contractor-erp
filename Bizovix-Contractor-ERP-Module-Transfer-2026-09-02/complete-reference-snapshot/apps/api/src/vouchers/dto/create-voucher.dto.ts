import { Type } from "class-transformer";
import { IsArray, IsIn, IsNumber, IsOptional, IsString, IsDateString, ValidateNested } from "class-validator";

class CreateVoucherLineDto {
  @IsString()
  id!: string;

  @IsOptional()
  @IsString()
  accountId?: string;

  @IsOptional()
  @IsString()
  @IsIn(["CASH", "BANK", "MFS"])
  moneyAccountType?: string;

  @IsString()
  ledger!: string;

  @IsString()
  description!: string;

  @IsNumber()
  debit!: number;

  @IsNumber()
  credit!: number;

  @IsOptional()
  @IsString()
  costCenter?: string;

  @IsOptional()
  @IsString()
  project?: string;

  @IsOptional()
  @IsString()
  billReference?: string;
}

class CreateVoucherInventoryItemDto {
  @IsString()
  id!: string;

  @IsOptional()
  @IsString()
  sourceInventoryLineId?: string;

  @IsOptional()
  @IsString()
  manufacturingInventoryLotId?: string;

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  manufacturingSerialIds?: string[];

  @IsString()
  itemName!: string;

  @IsNumber()
  quantity!: number;

  @IsNumber()
  unitPrice!: number;

  @IsOptional()
  @IsString()
  warehouseId?: string;

  @IsOptional()
  @IsString()
  batchNumber?: string;

  @IsOptional()
  @IsDateString()
  manufacturedAt?: string;

  @IsOptional()
  @IsDateString()
  expiresAt?: string;
}

export class CreateVoucherDto {
  @IsString()
  workspaceId!: string;

  @IsString()
  @IsIn([
    "contra",
    "payment",
    "receipt",
    "journal",
    "sales",
    "purchase",
    "expense",
    "revenue",
    "credit-note",
    "debit-note",
    "quotation",
    "proforma-invoice",
    "sales-order",
    "delivery-note",
    "purchase-order",
    "receipt-note",
  ])
  voucherType!: string;

  @IsOptional()
  @IsString()
  voucherNumber?: string;

  /** Which document in the flow this is: purchase-order, receipt-note, bill... */
  @IsOptional()
  @IsString()
  documentKind?: string;

  /** The voucher this one was created from (order -> receipt note -> bill). */
  @IsOptional()
  @IsString()
  sourceVoucherId?: string;

  @IsOptional()
  @IsString()
  warehouseId?: string;

  @IsDateString()
  voucherDate!: string;

  @IsString()
  partyName!: string;

  /** Stable Party master identity. Older clients may omit it; the API then
   * uses the workspace/type/name composite only as a compatibility lookup. */
  @IsOptional()
  @IsString()
  partyId?: string;

  @IsOptional()
  @IsString()
  reference?: string;

  @IsOptional()
  @IsString()
  narration?: string;

  // Only pre-approval states are settable directly; approved/posted/reversed
  // vouchers are reached exclusively through the guarded transition actions.
  @IsString()
  @IsIn(["draft", "pending", "rejected", "cancelled"])
  status!: string;

  @IsOptional()
  @IsString()
  idempotencyKey?: string;

  @IsOptional()
  @IsIn(["cash", "bank", "accounts-payable"])
  settlementMode?: string;

  @IsOptional()
  @IsNumber()
  paidAmount?: number;

  @IsOptional()
  @IsString()
  supplierAddress?: string;

  @IsOptional()
  @IsString()
  condition?: string;

  @IsOptional()
  @IsString()
  buyerSignature?: string;

  @IsOptional()
  @IsString()
  sellerSignature?: string;

  @IsOptional()
  @IsString()
  attachmentImageUrl?: string;

  @IsOptional()
  @IsString()
  attachmentDocumentUrl?: string;

  @IsOptional()
  @IsString()
  attachmentDocumentName?: string;

  @IsOptional()
  @IsString()
  discountType?: string;

  @IsOptional()
  @IsNumber()
  discountAmount?: number;

  @IsOptional()
  @IsNumber()
  roundOffAmount?: number;

  @IsOptional()
  @IsNumber()
  loyaltyPointsRedeemed?: number;

  @IsOptional()
  @IsNumber()
  loyaltyDiscountAmount?: number;

  @IsOptional()
  @IsNumber()
  subtotal?: number;

  @IsOptional()
  @IsNumber()
  totalAmount?: number;

  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => CreateVoucherLineDto)
  lines!: CreateVoucherLineDto[];

  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => CreateVoucherInventoryItemDto)
  inventoryItems?: CreateVoucherInventoryItemDto[];
}
