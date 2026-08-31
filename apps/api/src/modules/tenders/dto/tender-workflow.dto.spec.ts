import "reflect-metadata";
import { plainToInstance } from "class-transformer";
import { validate } from "class-validator";
import { CreateTenderDto } from "./create-tender.dto";
import { RejectTenderCostingDto, TenderCostingVersionDto } from "./tender-costing-action.dto";

async function propertiesWithErrors<T extends object>(type: new () => T, payload: object) {
  const errors = await validate(plainToInstance(type, payload), {
    whitelist: true,
    forbidNonWhitelisted: true,
  });
  return errors.map((error) => error.property);
}

const validTender = {
  organizationMasterId: "master-1",
  egpTenderId: "TID-2026-0001",
  workName: "Supply of equipment",
  category: "Supply",
};

describe("Tender workflow DTOs", () => {
  it("accepts OTM by default and every supported procurement method", async () => {
    const methods = [
      "OTM",
      "RFQ",
      "LTM",
      "TSTM",
      "QCBS",
      "LCS",
      "SFB",
      "DC",
      "SBCQ",
      "SSS",
      "IC",
      "CSE",
      "DPM",
      "OSTETM",
      "RFQU",
      "RFQL",
    ];
    await expect(propertiesWithErrors(CreateTenderDto, validTender)).resolves.toEqual([]);
    await expect(
      propertiesWithErrors(CreateTenderDto, {
        egpTenderId: validTender.egpTenderId,
        workName: validTender.workName,
        foundByName: "External source",
      }),
    ).resolves.toEqual([]);
    for (const procurementMethod of methods) {
      await expect(
        propertiesWithErrors(CreateTenderDto, { ...validTender, procurementMethod }),
      ).resolves.toEqual([]);
    }
  });

  it("rejects an unsupported procurement method and a missing or blank Tender ID", async () => {
    await expect(
      propertiesWithErrors(CreateTenderDto, { ...validTender, procurementMethod: "INVALID" }),
    ).resolves.toContain("procurementMethod");
    await expect(
      propertiesWithErrors(CreateTenderDto, { ...validTender, egpTenderId: "   " }),
    ).resolves.toContain("egpTenderId");
    const withoutTenderId: Partial<typeof validTender> = { ...validTender };
    delete withoutTenderId.egpTenderId;
    await expect(propertiesWithErrors(CreateTenderDto, withoutTenderId)).resolves.toContain(
      "egpTenderId",
    );
  });

  it("requires a positive integer version on costing workflow actions", async () => {
    await expect(propertiesWithErrors(TenderCostingVersionDto, { version: 1 })).resolves.toEqual(
      [],
    );
    await expect(propertiesWithErrors(TenderCostingVersionDto, { version: 0 })).resolves.toContain(
      "version",
    );
  });

  it("rejects a blank costing rejection reason", async () => {
    await expect(
      propertiesWithErrors(RejectTenderCostingDto, { version: 1, reason: "  " }),
    ).resolves.toContain("reason");
  });
});
