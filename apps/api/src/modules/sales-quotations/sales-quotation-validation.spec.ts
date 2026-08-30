import "reflect-metadata";
import { plainToInstance } from "class-transformer";
import { validate } from "class-validator";
import { SaveSalesQuotationCostingDto } from "./dto/sales-quotation.dto";
import { calculateSalesQuotationCosting } from "./sales-quotation-calculation";
import {
  neutralizeCsvCell,
  validateCalculatedCosting,
  validateCostingInput,
} from "./sales-quotation-validation";

const validCosting = () => ({
  expectedVersion: 1,
  items: [
    {
      description: "Work",
      quantity: "1.000",
      unit: "LS",
      unitCost: "10.00",
      taxPct: "5.00",
      unitPrice: "12.00",
    },
  ],
  overheads: [{ description: "Transport", amount: "2.00" }],
  vatApplicable: true,
  vatRate: "15.00",
});

describe("sales quotation validation", () => {
  it("accepts only database-safe decimal precision and percentage ranges at the DTO boundary", async () => {
    expect(
      await validate(plainToInstance(SaveSalesQuotationCostingDto, validCosting())),
    ).toHaveLength(0);
    const invalid = validCosting();
    invalid.items[0].unitCost = "10.001";
    invalid.items[0].taxPct = "100.01";
    invalid.vatRate = "101";
    expect(
      (await validate(plainToInstance(SaveSalesQuotationCostingDto, invalid))).length,
    ).toBeGreaterThan(0);
  });

  it("rejects empty items, zero quantity, malformed decimals and calculated database overflow", () => {
    expect(() => validateCostingInput({ ...validCosting(), items: [] })).toThrow(
      "At least one costing item",
    );
    expect(() =>
      validateCostingInput({
        ...validCosting(),
        items: [{ ...validCosting().items[0], quantity: "0" }],
      }),
    ).toThrow("greater than zero");
    expect(() =>
      validateCostingInput({
        ...validCosting(),
        items: [{ ...validCosting().items[0], unitPrice: "not-a-number" }],
      }),
    ).toThrow("invalid precision");
    const result = calculateSalesQuotationCosting({
      items: [
        {
          description: "Overflow",
          quantity: "999999999999999.999",
          unit: "LS",
          unitCost: "9999999999999999.99",
          unitPrice: "1.00",
        },
      ],
    });
    expect(() => validateCalculatedCosting(result)).toThrow("monetary range");
  });

  it.each(["=2+2", "+cmd", "-1+2", "@SUM(A1:A2)", '  =HYPERLINK("x")'])(
    "neutralizes formula-leading CSV cell %s",
    (value) => {
      expect(neutralizeCsvCell(value)).toBe(`'${value}`);
    },
  );

  it("does not alter ordinary CSV text", () => {
    expect(neutralizeCsvCell("Office Building")).toBe("Office Building");
  });
});
