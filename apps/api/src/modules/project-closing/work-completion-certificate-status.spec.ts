import {
  deriveWorkCompletionDisplayStatus,
  summarizeWorkCompletionRows,
} from "./work-completion-certificate-status";

describe("deriveWorkCompletionDisplayStatus", () => {
  it("keeps a project without a certificate as not applied", () => {
    expect(deriveWorkCompletionDisplayStatus(null)).toBe("NOT_APPLIED");
  });

  it("does not infer a source for a legacy approved certificate", () => {
    expect(
      deriveWorkCompletionDisplayStatus({
        source: "UNSPECIFIED",
        status: "APPROVED",
        egpStatus: "UNSPECIFIED",
      }),
    ).toBe("WCC_OBTAINED");
  });

  it("tracks an e-GP application before approval", () => {
    expect(
      deriveWorkCompletionDisplayStatus({
        source: "EGP",
        status: "SUBMITTED",
        egpStatus: "NOT_APPLICABLE",
      }),
    ).toBe("WCC_APPLIED");
  });

  it("distinguishes manual WCC e-GP follow-up states", () => {
    expect(
      deriveWorkCompletionDisplayStatus({
        source: "MANUAL",
        status: "APPROVED",
        egpStatus: "NOT_APPLIED",
      }),
    ).toBe("MANUAL_WCC_OBTAINED_EGP_NOT_APPLIED");
    expect(
      deriveWorkCompletionDisplayStatus({
        source: "MANUAL",
        status: "APPROVED",
        egpStatus: "UNDER_PROCESS",
      }),
    ).toBe("MANUAL_WCC_OBTAINED_EGP_APPLIED");
    expect(
      deriveWorkCompletionDisplayStatus({
        source: "MANUAL",
        status: "APPROVED",
        egpStatus: "OBTAINED",
      }),
    ).toBe("WCC_OBTAINED");
  });
});

describe("summarizeWorkCompletionRows", () => {
  it("moves a manual WCC with an obtained e-GP follow-up into the e-GP breakdown", () => {
    const stats = summarizeWorkCompletionRows([
      {
        certificate: { source: "EGP", status: "APPROVED", egpStatus: "NOT_APPLICABLE" },
      },
      {
        certificate: { source: "MANUAL", status: "APPROVED", egpStatus: "NOT_APPLIED" },
      },
      {
        certificate: { source: "MANUAL", status: "APPROVED", egpStatus: "OBTAINED" },
      },
      {
        certificate: { source: "UNSPECIFIED", status: "APPROVED", egpStatus: "UNSPECIFIED" },
      },
      { certificate: null },
    ]);

    expect(stats).toMatchObject({
      totalProjects: 5,
      wccObtained: 4,
      obtainedEgp: 2,
      obtainedManual: 1,
      unclassifiedObtained: 1,
      withoutWcc: 1,
    });
    expect(stats.obtainedEgp + stats.obtainedManual + stats.unclassifiedObtained).toBe(
      stats.wccObtained,
    );
  });
});
