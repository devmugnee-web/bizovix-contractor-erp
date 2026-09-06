import { Prisma } from "@bizovix/database";
import { validate } from "class-validator";
import ExcelJS from "exceljs";
import { taxTotals } from "./tender-vat-tax.service";
import { CreateTenderTaxDto, TenderTaxQueryDto } from "./dto/tender-vat-tax.dto";
import { tenderTaxExcel, tenderTaxPdf } from "./tender-vat-tax-export";

describe("Tender VAT Tax register", () => {
  it("sums exact decimal deposits and deductions once, with a separate breakdown", () => {
    const result = taxTotals([
      { taxType: "VAT", entryKind: "SELF_DEPOSIT", _sum: { amount: new Prisma.Decimal("0.10") }, _count: { _all: 1 } },
      { taxType: "VAT", entryKind: "BILL_DEDUCTION", _sum: { amount: new Prisma.Decimal("0.20") }, _count: { _all: 1 } },
      { taxType: "TAX", entryKind: "SELF_DEPOSIT", _sum: { amount: new Prisma.Decimal("123456.78") }, _count: { _all: 2 } },
    ]);
    expect(result).toEqual({ vat: "0.30", tax: "123456.78", total: "123457.08", depositedVat: "0.10", deductedVat: "0.20", depositedTax: "123456.78", deductedTax: "0.00", entryCount: 4 });
    expect(taxTotals([]).total).toBe("0.00");
  });
  it("validates real dates, enums, required reference and decimal precision", async () => {
    const input = { requestId: "d651d998-ec98-41d6-aacd-3f0946f9a26b", taxType: "VAT", entryKind: "SELF_DEPOSIT", amount: "10.25", entryDate: "2026-01-01", referenceNo: "CH-1" };
    expect(await validate(Object.assign(new CreateTenderTaxDto(), input))).toEqual([]);
    for (const change of [{ amount: "-1" }, { amount: "NaN" }, { amount: "1.234" }, { amount: "1e5" }, { referenceNo: " " }, { entryDate: "2026-02-30" }, { taxType: "PROFIT" }, { entryKind: "ESTIMATE" }]) expect((await validate(Object.assign(new CreateTenderTaxDto(), input, change))).length).toBeGreaterThan(0);
    expect((await validate(Object.assign(new TenderTaxQueryDto(), { dateFrom: "wrong" }))).length).toBeGreaterThan(0);
  });
  it("exports a real editable Excel workbook without converting text to formulas", async () => {
    const totals = taxTotals([]);
    const report = { tenders: [{ id: "t", tenderNumber: "000123", workName: '=HYPERLINK("https://invalid")', ...totals }], entries: [], totals, dateFrom: "2026-01-01", dateTo: "2026-12-31", entryKind: null, taxType: null, detail: false };
    const file = await tenderTaxExcel(report); expect(file.subarray(0, 2).toString()).toBe("PK");
    const workbook = new ExcelJS.Workbook(); await workbook.xlsx.load(file as unknown as ExcelJS.Buffer);
    expect(workbook.worksheets.map((s) => s.name)).toEqual(["Tender Summary", "Entries"]);
    expect(workbook.worksheets[0]!.getCell("B10").value).toBe("000123");
    expect(workbook.worksheets[0]!.getCell("C10").type).toBe(ExcelJS.ValueType.String);
    const pdf = await tenderTaxPdf(report); expect(pdf.subarray(0, 5).toString()).toBe("%PDF-");
  });
});
