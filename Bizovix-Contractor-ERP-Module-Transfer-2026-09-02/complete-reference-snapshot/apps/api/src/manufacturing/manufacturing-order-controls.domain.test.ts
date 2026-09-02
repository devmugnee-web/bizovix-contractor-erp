import { describe, expect, it } from "vitest";

import {
  evaluateOrderActionApprovalControls,
  isApprovalSensitiveOrderAction,
  isOpenQualityCaseLinkedToOrder,
  satisfiesPassedQualityInspectionIndependence,
} from "./manufacturing-order-controls.domain.js";

describe("manufacturing order approval controls", () => {
  it.each([
    "APPROVE",
    "AMEND",
    "CANCEL",
    "RECORD_IN_PROCESS_RESULT",
    "RECORD_QUALITY_RESULT",
    "QA_RELEASE",
    "CLOSE",
  ])("marks %s as approval-sensitive", (action) => {
    expect(isApprovalSensitiveOrderAction(action)).toBe(true);
  });

  it("does not require an electronic signature for an ordinary execution action", () => {
    expect(isApprovalSensitiveOrderAction("START_OPERATION")).toBe(false);
  });

  it("enforces maker-checker for an approval-required order", () => {
    expect(
      evaluateOrderActionApprovalControls({
        action: "APPROVE",
        approvalRequired: true,
        electronicSignatureRequired: false,
        orderCreatorUserId: "user-1",
        actingUserId: "user-1",
      }),
    ).toContain("MAKER_CHECKER_REQUIRED");
    expect(
      evaluateOrderActionApprovalControls({
        action: "APPROVE",
        approvalRequired: true,
        electronicSignatureRequired: false,
        orderCreatorUserId: "user-1",
        actingUserId: "user-2",
      }),
    ).not.toContain("MAKER_CHECKER_REQUIRED");
  });

  it("requires signature meaning only for configured sensitive actions", () => {
    expect(
      evaluateOrderActionApprovalControls({
        action: "QA_RELEASE",
        approvalRequired: false,
        electronicSignatureRequired: true,
        orderCreatorUserId: "user-1",
        actingUserId: "user-2",
        signatureMeaning: "",
      }),
    ).toContain("SIGNATURE_MEANING_REQUIRED");
    expect(
      evaluateOrderActionApprovalControls({
        action: "QA_RELEASE",
        approvalRequired: false,
        electronicSignatureRequired: true,
        orderCreatorUserId: "user-1",
        actingUserId: "user-2",
        signatureMeaning: "Released by QA",
      }),
    ).not.toContain("SIGNATURE_MEANING_REQUIRED");
  });
});

describe("passed QC inspection independence", () => {
  it.each(["PHARMACEUTICAL", "HYBRID"] as const)(
    "requires a different non-null inspector and approver in %s mode",
    (mode) => {
      expect(
        satisfiesPassedQualityInspectionIndependence({
          mode,
          status: "PASSED",
          inspectedByUserId: "qc-inspector",
          approvedByUserId: "qa-reviewer",
        }),
      ).toBe(true);
      expect(
        satisfiesPassedQualityInspectionIndependence({
          mode,
          status: "PASSED",
          inspectedByUserId: "same-user",
          approvedByUserId: "same-user",
        }),
      ).toBe(false);
      expect(
        satisfiesPassedQualityInspectionIndependence({
          mode,
          status: "PASSED",
          inspectedByUserId: null,
          approvedByUserId: "qa-reviewer",
        }),
      ).toBe(false);
      expect(
        satisfiesPassedQualityInspectionIndependence({
          mode,
          status: "PASSED",
          inspectedByUserId: "qc-inspector",
          approvedByUserId: null,
        }),
      ).toBe(false);
    },
  );

  it("keeps legacy GENERAL passed inspections compatible", () => {
    expect(
      satisfiesPassedQualityInspectionIndependence({
        mode: "GENERAL",
        status: "PASSED",
        inspectedByUserId: null,
        approvedByUserId: null,
      }),
    ).toBe(true);
    expect(
      satisfiesPassedQualityInspectionIndependence({
        mode: "GENERAL",
        status: "PASSED",
        inspectedByUserId: "same-user",
        approvedByUserId: "same-user",
      }),
    ).toBe(true);
  });

  it("does not treat a non-passed inspection as release-eligible", () => {
    expect(
      satisfiesPassedQualityInspectionIndependence({
        mode: "GENERAL",
        status: "FAILED",
        inspectedByUserId: "qc-inspector",
        approvedByUserId: "qa-reviewer",
      }),
    ).toBe(false);
  });
});

describe("QA release quality-case linkage", () => {
  const order = { id: "order-1", finishedProductId: "finished-1" };

  it("finds open cases linked by production order or finished product", () => {
    expect(
      isOpenQualityCaseLinkedToOrder(
        {
          status: "APPROVED",
          payload: { orderId: "order-1", state: "INVESTIGATING" },
        },
        order,
      ),
    ).toBe(true);
    expect(
      isOpenQualityCaseLinkedToOrder(
        {
          status: "DRAFT",
          inventoryItemId: "finished-1",
          payload: { state: "OPEN" },
        },
        order,
      ),
    ).toBe(true);
  });

  it("finds UI-created cases inside the governance payload wrapper", () => {
    expect(
      isOpenQualityCaseLinkedToOrder(
        {
          status: "DRAFT",
          payload: {
            schemaVersion: 1,
            details: {
              productionOrderId: "order-1",
              inventoryItemId: "finished-1",
              state: "INVESTIGATION",
            },
            evidenceHash: "hash",
          },
        },
        order,
      ),
    ).toBe(true);
  });

  it.each(["CLOSED", "RESOLVED", "CANCELLED"])(
    "allows a linked case whose state is %s",
    (state) => {
      expect(
        isOpenQualityCaseLinkedToOrder(
          { status: "APPROVED", payload: { orderId: "order-1", state } },
          order,
        ),
      ).toBe(false);
    },
  );

  it.each(["CLOSED", "RESOLVED", "CANCELLED"])(
    "allows a wrapped UI-created case whose state is %s",
    (state) => {
      expect(
        isOpenQualityCaseLinkedToOrder(
          {
            status: "APPROVED",
            payload: {
              schemaVersion: 1,
              details: { productionOrderId: "order-1", state },
              evidenceHash: "hash",
            },
          },
          order,
        ),
      ).toBe(false);
    },
  );

  it("ignores retired records and unrelated cases", () => {
    expect(
      isOpenQualityCaseLinkedToOrder(
        { status: "RETIRED", payload: { orderId: "order-1", state: "OPEN" } },
        order,
      ),
    ).toBe(false);
    expect(
      isOpenQualityCaseLinkedToOrder(
        { status: "APPROVED", payload: { orderId: "order-2", state: "OPEN" } },
        order,
      ),
    ).toBe(false);
  });
});
