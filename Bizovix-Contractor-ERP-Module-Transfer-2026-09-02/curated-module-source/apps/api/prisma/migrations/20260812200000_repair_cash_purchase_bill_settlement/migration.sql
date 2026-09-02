UPDATE "VoucherEntry" AS bill
SET "settlementMode" = 'CASH'
FROM "VoucherEntry" AS receipt
WHERE bill."sourceVoucherId" = receipt."id"
  AND bill."voucherType" = 'PURCHASE'
  AND bill."documentKind" = 'bill'
  AND receipt."documentKind" = 'receipt-note'
  AND receipt."settlementMode" = 'CASH'
  AND bill."settlementMode" = 'ACCOUNTS_PAYABLE';

UPDATE "VoucherEntryLine" AS line
SET "ledger" = 'Cash in Hand',
    "description" = 'Cash purchase settlement',
    "costCenter" = 'Cash-in-Hand'
FROM "VoucherEntry" AS bill, "VoucherEntry" AS receipt
WHERE line."voucherId" = bill."id"
  AND bill."sourceVoucherId" = receipt."id"
  AND bill."voucherType" = 'PURCHASE'
  AND bill."documentKind" = 'bill'
  AND bill."settlementMode" = 'CASH'
  AND receipt."documentKind" = 'receipt-note'
  AND receipt."settlementMode" = 'CASH'
  AND line."credit" > 0;
