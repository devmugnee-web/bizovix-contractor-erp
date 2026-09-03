import "reflect-metadata";
import { plainToInstance } from "class-transformer";
import { validate } from "class-validator";
import {
  SaveTenderCostingDto,
  SetTenderCostingBudgetDto,
  TenderCostingItemInputDto,
} from "./tender-costing.dto";

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
      lcContainerFee: 90000,
      lcContainerAllocationMethod: "EQUAL",
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
          foreignShippingMethod: "DOOR_TO_DOOR_AIR",
          foreignShippingProvider: "Demo Forwarder",
          foreignDoorToDoorCharge: 250,
          foreignImportDutyIncluded: true,
          foreignTransitDays: 5,
          foreignShippingReference: "SHIP-001",
          foreignTransportCharge: 25,
          customsDeclarationCharge: 10,
          shippingWeightKg: 125.5,
          shippingVolumeCbm: 2.75,
          shippingRateBasis: "PER_CBM",
          shippingRate: 80,
          domesticTransportCost: 500,
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

  it("rejects an invalid LC container allocation", async () => {
    const payload = plainToInstance(SaveTenderCostingDto, {
      version: 1,
      status: "IN_PROGRESS",
      costingDate: "2026-09-03",
      currency: "BDT",
      exchangeRate: 1,
      costingVersion: 1,
      freightCost: 0,
      installationCost: 0,
      otherCost: 0,
      contingencyPercent: 0,
      lcContainerFee: -1,
      lcContainerAllocationMethod: "BY_QUANTITY",
      items: [],
    });

    const errors = await validate(payload);
    expect(errors.some((error) => error.property === "lcContainerFee")).toBe(true);
    expect(errors.some((error) => error.property === "lcContainerAllocationMethod")).toBe(true);
  });

  it("rejects an unsupported shipping rate basis and negative Door-to-Door costs", async () => {
    const payload = plainToInstance(TenderCostingItemInputDto, {
      costingDate: "2026-09-01",
      description: "Imported item",
      unit: "Nos",
      quantity: 1,
      sourcingType: "FOREIGN",
      costingStatus: "DRAFT",
      shippingRateBasis: "PER_TON",
      foreignTransportCharge: -1,
    });

    const errors = await validate(payload);

    expect(errors.some((error) => error.property === "shippingRateBasis")).toBe(true);
    expect(errors.some((error) => error.property === "foreignTransportCharge")).toBe(true);
  });
});
