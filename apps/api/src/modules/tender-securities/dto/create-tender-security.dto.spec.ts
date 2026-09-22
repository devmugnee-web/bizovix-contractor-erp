import "reflect-metadata";
import { BadRequestException, ValidationPipe } from "@nestjs/common";
import { CreateTenderSecurityDto } from "./create-tender-security.dto";

describe("CreateTenderSecurityDto reference number validation", () => {
  const pipe = new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true, transform: true });
  const metadata = { type: "body" as const, metatype: CreateTenderSecurityDto };
  const payload = (referenceNo: unknown, securityType = "PAY_ORDER") => ({
    securityType,
    bankId: "bank-1",
    fundingType: "LOAN",
    issueDate: "2026-09-21",
    validityMonths: 6,
    expiryDate: "2027-03-21",
    interestRate: 15,
    chargeFromAccountId: "bank-1",
    items: [
      { documentPurchaseId: "purchase-1", securityAmount: 60000, marginPercentage: 5, referenceNo: "PO-001" },
      { documentPurchaseId: "purchase-2", securityAmount: 40000, marginPercentage: 5, referenceNo },
    ],
  });

  it.each([undefined, null, "", "   ", "\t\n", 123])("rejects an invalid reference on any selected tender: %p", async (referenceNo) => {
    await expect(pipe.transform(payload(referenceNo), metadata)).rejects.toBeInstanceOf(BadRequestException);
  });

  it.each(["PAY_ORDER", "BANK_GUARANTEE"])("accepts and trims a manually entered %s reference without generating one", async (securityType) => {
    const result = await pipe.transform(payload("  00123/Bank-2026  ", securityType), metadata) as CreateTenderSecurityDto;

    expect(result.items.map((item) => item.referenceNo)).toEqual(["PO-001", "00123/Bank-2026"]);
  });
});
