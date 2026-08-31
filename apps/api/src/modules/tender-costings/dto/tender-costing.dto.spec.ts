import "reflect-metadata";
import { plainToInstance } from "class-transformer";
import { validate } from "class-validator";
import { SaveTenderCostingDto, SetTenderCostingBudgetDto } from "./tender-costing.dto";

describe("SaveTenderCostingDto", () => {
  it("accepts a positive Tender Costing Budget", async () => {
    const payload = plainToInstance(SetTenderCostingBudgetDto, {
      version: 1,
      costingBudget: 250000,
    });
    expect(await validate(payload, { whitelist: true, forbidNonWhitelisted: true })).toEqual([]);
  });

  it("rejects a zero Tender Costing Budget", async () => {
    const payload = plainToInstance(SetTenderCostingBudgetDto, {
      version: 1,
      costingBudget: 0,
    });
    expect(await validate(payload)).not.toEqual([]);
  });

  it("accepts the renderer costing payload including item sort order", async () => {
    const payload = plainToInstance(SaveTenderCostingDto, {
      version: 1,
      status: "IN_PROGRESS",
      costingDate: "2026-08-30",
      currency: "BDT",
      exchangeRate: 1,
      costingVersion: 1,
      freightCost: 0,
      installationCost: 0,
      otherCost: 0,
      contingencyPercent: 0,
      validityDays: 30,
      items: [
        {
          costingDate: "2026-08-30",
          preparedByUserId: "user-1",
          description: "Supply item",
          unit: "Nos",
          quantity: 1,
          sourcingType: "LOCAL",
          costingStatus: "COSTED",
          selectedSource: "LOCAL",
          localUnitPrice: 100,
          localVatPercent: 5,
          localTaxPercent: 2,
          sortOrder: 0,
        },
      ],
    });

    const errors = await validate(payload, {
      whitelist: true,
      forbidNonWhitelisted: true,
    });

    expect(errors).toEqual([]);
  });
});
