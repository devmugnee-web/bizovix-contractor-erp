import argon2 from "argon2";
import {
  afterEach,
  beforeAll,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from "vitest";

import { ManufacturingElectronicSignatureService } from "./manufacturing-electronic-signature.service.js";

const scope = {
  id: "workspace-1",
  tenantId: "tenant-1",
  companyId: "company-1",
};
const user = {
  id: "checker-1",
  sessionId: "session-1",
  tenantId: "tenant-1",
  companyId: "company-1",
  workspaceId: "workspace-1",
} as never;

let passwordHash = "";

function policy(
  overrides: Partial<
    Record<
      | "signatureMeanings"
      | "reauthenticationRequired"
      | "sessionTimeoutMinutes"
      | "mfaRequired",
      unknown
    >
  > = {},
) {
  return {
    id: "policy-1",
    code: "E-SIGN",
    versionNumber: 2,
    payload: {
      details: {
        signatureMeanings: ["Reviewed", "Approved", "Released"],
        reauthenticationRequired: true,
        sessionTimeoutMinutes: 15,
        mfaRequired: false,
        ...overrides,
      },
    },
  };
}

function transaction(record: ReturnType<typeof policy> | null = policy()) {
  return {
    manufacturingControlRecord: {
      findFirst: vi.fn().mockResolvedValue(record),
    },
    userSession: {
      findFirst: vi.fn().mockResolvedValue({
        id: "session-1",
        expiresAt: new Date("2026-09-02T00:00:00.000Z"),
        lastUsedAt: new Date("2026-09-01T11:55:00.000Z"),
        revokedAt: null,
        user: { passwordHash },
      }),
    },
  } as never;
}

describe("manufacturing electronic-signature runtime", () => {
  beforeAll(async () => {
    passwordHash = await argon2.hash("correct-password");
  });

  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-09-01T12:00:00.000Z"));
  });

  afterEach(() => vi.useRealTimers());

  it("accepts an allowed meaning, active session and valid current password without retaining the password", async () => {
    const service = new ManufacturingElectronicSignatureService();
    const result = await service.enforce(transaction(), {
      scope,
      user,
      actionLabel: "approve production order",
      signatureMeaning: "Approved",
      reauthenticationPassword: "correct-password",
      required: true,
    });

    expect(result).toEqual({
      policyRecordId: "policy-1",
      policyCode: "E-SIGN",
      policyVersion: 2,
      reauthenticated: true,
      sessionValidated: true,
    });
    expect(JSON.stringify(result)).not.toContain("correct-password");
  });

  it("rejects an invalid current password", async () => {
    await expect(
      new ManufacturingElectronicSignatureService().enforce(transaction(), {
        scope,
        user,
        actionLabel: "approve production order",
        signatureMeaning: "Approved",
        reauthenticationPassword: "wrong-password",
        required: true,
      }),
    ).rejects.toThrow("Current password is incorrect");
  });

  it("rejects a policy-expired authenticated session", async () => {
    const tx = transaction();
    (tx as any).userSession.findFirst.mockResolvedValue({
      id: "session-1",
      expiresAt: new Date("2026-09-02T00:00:00.000Z"),
      lastUsedAt: new Date("2026-09-01T11:44:59.000Z"),
      revokedAt: null,
      user: { passwordHash },
    });
    await expect(
      new ManufacturingElectronicSignatureService().enforce(tx, {
        scope,
        user,
        actionLabel: "approve production order",
        signatureMeaning: "Approved",
        reauthenticationPassword: "correct-password",
        required: true,
      }),
    ).rejects.toThrow("session expired after 15 minutes");
  });

  it("rejects a meaning not allowed by the approved policy", async () => {
    await expect(
      new ManufacturingElectronicSignatureService().enforce(transaction(), {
        scope,
        user,
        actionLabel: "approve production order",
        signatureMeaning: "Signed",
        reauthenticationPassword: "correct-password",
        required: true,
      }),
    ).rejects.toThrow("must exactly match one of the approved policy meanings");
  });

  it("fails closed when the approved policy requires unavailable MFA", async () => {
    const tx = transaction(policy({ mfaRequired: true }));
    await expect(
      new ManufacturingElectronicSignatureService().enforce(tx, {
        scope,
        user,
        actionLabel: "approve production order",
        signatureMeaning: "Approved",
        reauthenticationPassword: "correct-password",
        required: true,
      }),
    ).rejects.toThrow("requires MFA, but MFA verification is not configured");
    expect((tx as any).userSession.findFirst).not.toHaveBeenCalled();
  });

  it("fails closed when no approved electronic-signature policy exists", async () => {
    const tx = transaction(null);
    await expect(
      new ManufacturingElectronicSignatureService().enforce(tx, {
        scope,
        user,
        actionLabel: "approve production order",
        signatureMeaning: "Approved",
        required: true,
      }),
    ).rejects.toThrow(
      "An approved manufacturing electronic-signature policy is required",
    );
    expect((tx as any).userSession.findFirst).not.toHaveBeenCalled();
  });

  it("does not require a policy when neither a signature nor a signed action is requested", async () => {
    const tx = transaction(null);
    await expect(
      new ManufacturingElectronicSignatureService().enforce(tx, {
        scope,
        user,
        actionLabel: "view production order",
        required: false,
      }),
    ).resolves.toBeNull();
    expect(
      (tx as any).manufacturingControlRecord.findFirst,
    ).not.toHaveBeenCalled();
    expect((tx as any).userSession.findFirst).not.toHaveBeenCalled();
  });
});
