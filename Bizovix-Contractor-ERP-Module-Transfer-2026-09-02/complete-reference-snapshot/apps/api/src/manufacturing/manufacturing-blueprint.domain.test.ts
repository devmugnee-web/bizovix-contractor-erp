import { describe, expect, it } from "vitest";

import {
  calculateResourceCapacity,
  evaluatePeriodEvidencePack,
  evaluateResourceReadiness,
  formatManufacturingDocumentNumber,
  manufacturingPeriodBounds,
  summarizeCapacity,
  type ResourceReadinessInput,
} from "./manufacturing-blueprint.domain.js";

function readyResource(
  overrides: Partial<ResourceReadinessInput> = {},
): ResourceReadinessInput {
  return {
    resourceId: "equipment-1",
    code: "EQ-FRIDGE-01",
    name: "Fridge assembly fixture",
    active: true,
    qualificationState: "READY",
    qualificationValidUntil: new Date("2026-12-31T00:00:00.000Z"),
    calibrationState: "READY",
    calibrationDueAt: new Date("2026-12-31T00:00:00.000Z"),
    maintenanceState: "READY",
    maintenanceDueAt: new Date("2026-12-31T00:00:00.000Z"),
    cleaningState: "CLEAN",
    readinessEvidenceReference: "EQ-READINESS-2026-09",
    ...overrides,
  };
}

describe("manufacturing blueprint resource readiness", () => {
  it("blocks expired calibration evidence on the plan readiness date", () => {
    const result = evaluateResourceReadiness(
      readyResource({ calibrationDueAt: new Date("2026-09-15T00:00:00.000Z") }),
      new Date("2026-09-30T00:00:00.000Z"),
    );

    expect(result.ready).toBe(false);
    expect(result.blockers).toContain(
      "Calibration evidence expired before the capacity-check date.",
    );
  });

  it("keeps due-soon readiness visible without blocking when evidence remains valid", () => {
    const result = evaluateResourceReadiness(
      readyResource({ maintenanceState: "DUE_SOON" }),
      new Date("2026-09-30T00:00:00.000Z"),
    );

    expect(result.ready).toBe(true);
    expect(result.warnings).toContain("Maintenance is due soon.");
  });

  it("blocks equipment whose readiness evidence reference is missing", () => {
    const result = evaluateResourceReadiness(
      readyResource({ readinessEvidenceReference: " " }),
      new Date("2026-09-30T00:00:00.000Z"),
    );

    expect(result.ready).toBe(false);
    expect(result.blockers).toContain(
      "Readiness evidence reference is missing.",
    );
  });
});

describe("manufacturing blueprint capacity", () => {
  it("blocks START_OPERATION-style mandatory equipment with unsafe readiness and no approved calendar capacity", () => {
    const result = calculateResourceCapacity(
      {
        operationId: "op-assembly",
        operationCode: "ASSEMBLY",
        resource: readyResource({
          active: false,
          qualificationState: "BLOCKED",
          maintenanceDueAt: new Date("2026-09-01T00:00:00.000Z"),
          cleaningState: "DUE",
        }),
        setupMinutes: 30,
        queueMinutes: 10,
        runMinutesPerUnit: 12,
        plannedQuantity: 10,
        lotCount: 1,
        requiredUnits: 1,
        capacityMultiplier: 1,
        mandatory: true,
        availableMinutes: 0,
      },
      new Date("2026-09-30T00:00:00.000Z"),
    );
    expect(result.ready).toBe(false);
    expect(result.blockers).toEqual(
      expect.arrayContaining([
        "Resource is inactive.",
        "Qualification is blocked.",
        "Maintenance evidence expired before the capacity-check date.",
        "Cleaning is not current.",
      ]),
    );
    expect(
      result.blockers.some((message) =>
        message.startsWith("Capacity shortfall:"),
      ),
    ).toBe(true);
  });

  it("calculates setup and queue per lot plus run time per unit", () => {
    const row = calculateResourceCapacity(
      {
        operationId: "op-assembly",
        operationCode: "ASSEMBLY",
        resource: readyResource(),
        setupMinutes: 30,
        queueMinutes: 10,
        runMinutesPerUnit: 12,
        plannedQuantity: 10,
        lotCount: 4,
        requiredUnits: 2,
        capacityMultiplier: 1.2,
        mandatory: true,
        availableMinutes: 500,
      },
      new Date("2026-09-30T00:00:00.000Z"),
    );

    // (((30 + 10) * 4) + (12 * 10)) * 1.2 / 2
    expect(row.requiredMinutes).toBe(168);
    expect(row.ready).toBe(true);
  });

  it("counts a shared resource calendar once and detects its aggregate shortfall", () => {
    const resource = readyResource();
    const first = calculateResourceCapacity(
      {
        operationId: "op-1",
        operationCode: "CUT",
        resource,
        setupMinutes: 0,
        queueMinutes: 0,
        runMinutesPerUnit: 10,
        plannedQuantity: 10,
        lotCount: 1,
        requiredUnits: 1,
        capacityMultiplier: 1,
        mandatory: true,
        availableMinutes: 200,
      },
      new Date("2026-09-30T00:00:00.000Z"),
    );
    const second = calculateResourceCapacity(
      {
        operationId: "op-2",
        operationCode: "ASSEMBLE",
        resource,
        setupMinutes: 0,
        queueMinutes: 0,
        runMinutesPerUnit: 15,
        plannedQuantity: 10,
        lotCount: 1,
        requiredUnits: 1,
        capacityMultiplier: 1,
        mandatory: true,
        availableMinutes: 200,
      },
      new Date("2026-09-30T00:00:00.000Z"),
    );

    expect(first.ready).toBe(true);
    expect(second.ready).toBe(true);
    const summary = summarizeCapacity([first, second]);
    expect(summary.availableMinutes).toBe(200);
    expect(summary.requiredMinutes).toBe(250);
    expect(summary.status).toBe("BLOCKED");
    expect(
      summary.blockers.some((row) =>
        row.message.startsWith("Aggregate capacity shortfall"),
      ),
    ).toBe(true);
  });
});

describe("manufacturing blueprint document and period controls", () => {
  const attachment = {
    fileName: "sep-uat.txt",
    mimeType: "text/plain",
    sizeBytes: 3,
    sha256: "72c048cb510077e42ecf2d941b2a12e93be6af7c6203e9517a48f8c8a21dc549",
    dataUrl: "data:text/plain;base64,VUFU",
  };

  it("requires a linked approved evidence pack covering the complete period", () => {
    const result = evaluatePeriodEvidencePack({
      periodStart: new Date("2026-09-01T00:00:00.000Z"),
      periodEnd: new Date("2026-09-30T00:00:00.000Z"),
      validationReference: "SEP-2026-UAT",
      packs: [
        {
          id: "pack-1",
          code: "PACK-SEP",
          payload: {
            details: {
              periodFrom: "2026-09-01",
              periodTo: "2026-09-30",
              evidenceReference: "SEP-2026-UAT",
              attachments: [attachment],
            },
          },
        },
      ],
    });
    expect(result.ready).toBe(true);
    expect(result.eligible).toHaveLength(1);
  });

  it("blocks missing reference, partial coverage and malformed attachments", () => {
    const result = evaluatePeriodEvidencePack({
      periodStart: new Date("2026-09-01T00:00:00.000Z"),
      periodEnd: new Date("2026-09-30T00:00:00.000Z"),
      validationReference: " ",
      packs: [
        {
          id: "pack-1",
          code: "PACK-SEP",
          payload: {
            details: {
              periodFrom: "2026-09-02",
              periodTo: "2026-09-30",
              evidenceReference: "SEP-2026-UAT",
              attachments: [{ ...attachment, sha256: "bad" }],
            },
          },
        },
      ],
    });
    expect(result.ready).toBe(false);
    expect(result.blockers).toHaveLength(2);
  });

  it("blocks a nonempty validation reference that does not link to the eligible pack", () => {
    const result = evaluatePeriodEvidencePack({
      periodStart: new Date("2026-09-01T00:00:00.000Z"),
      periodEnd: new Date("2026-09-30T00:00:00.000Z"),
      validationReference: "UNRELATED-REVIEW",
      packs: [
        {
          id: "pack-1",
          code: "PACK-SEP",
          payload: {
            details: {
              periodFrom: "2026-09-01",
              periodTo: "2026-09-30",
              evidenceReference: "SEP-2026-UAT",
              attachments: [attachment],
            },
          },
        },
      ],
    });
    expect(result.ready).toBe(false);
    expect(result.blockers).toContain(
      "The validation reference must match the eligible audit evidence pack ID, code or evidence reference.",
    );
  });

  it("formats annually reset controlled document numbers", () => {
    expect(
      formatManufacturingDocumentNumber({
        prefix: "CAP",
        sequenceNumber: 42,
        padding: 6,
        year: 2026,
        includeYear: true,
      }),
    ).toBe("CAP-2026-000042");
  });

  it("formats monthly reset controlled document numbers", () => {
    expect(
      formatManufacturingDocumentNumber({
        prefix: "QC-",
        sequenceNumber: 7,
        padding: 4,
        year: 2026,
        month: 9,
        includeYear: true,
        resetPeriod: "MONTHLY",
      }),
    ).toBe("QC-2026-09-0007");
  });

  it("returns exact inclusive September 2026 period boundaries", () => {
    const period = manufacturingPeriodBounds(2026, 9);
    expect(period.start.toISOString()).toBe("2026-09-01T00:00:00.000Z");
    expect(period.end.toISOString()).toBe("2026-09-30T00:00:00.000Z");
  });

  it("rejects an invalid manufacturing month", () => {
    expect(() => manufacturingPeriodBounds(2026, 13)).toThrow(
      "Invalid manufacturing period month.",
    );
  });
});
