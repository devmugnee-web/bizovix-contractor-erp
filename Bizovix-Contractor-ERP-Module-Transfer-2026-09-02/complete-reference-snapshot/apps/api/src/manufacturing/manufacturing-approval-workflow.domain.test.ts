import { describe, expect, it } from "vitest";

import {
  approvalProgress,
  parseManufacturingApprovalWorkflow,
} from "./manufacturing-approval-workflow.domain.js";

describe("manufacturing approval workflow", () => {
  it("selects the configured scope and orders stages", () => {
    expect(
      parseManufacturingApprovalWorkflow(
        {
          workflowScope: "PRODUCTION_ORDER",
          stages: [
            {
              sequence: 2,
              permissionKey: "manufacturing.quality.release",
              signatureMeaning: "QA released",
            },
            {
              sequence: 1,
              permissionKey: "manufacturing.order.approve",
              signatureMeaning: "Production approved",
            },
          ],
        },
        "PRODUCTION_ORDER",
      )?.map((stage) => stage.sequence),
    ).toEqual([1, 2]);
  });

  it("rejects a different scope or malformed stages", () => {
    expect(
      parseManufacturingApprovalWorkflow(
        { workflowScope: "BOM_VERSION", stages: [] },
        "PRODUCTION_ORDER",
      ),
    ).toBeNull();
    expect(
      parseManufacturingApprovalWorkflow(
        { workflowScope: "PRODUCTION_ORDER", stages: [{ sequence: 1 }] },
        "PRODUCTION_ORDER",
      ),
    ).toBeNull();
    expect(
      parseManufacturingApprovalWorkflow(
        {
          workflowScope: "PRODUCTION_ORDER",
          stages: [
            {
              sequence: 1,
              permissionKey: "manufacturing.order.approve",
              signatureMeaning: "Approved",
            },
            {
              sequence: 3,
              permissionKey: "manufacturing.audit.review",
              signatureMeaning: "Verified",
            },
          ],
        },
        "PRODUCTION_ORDER",
      ),
    ).toBeNull();
  });

  it("unwraps the controlled-record details envelope", () => {
    expect(
      parseManufacturingApprovalWorkflow(
        {
          schemaVersion: 1,
          details: {
            workflowScope: "BOM_VERSION",
            stages: [
              {
                sequence: 1,
                permissionKey: "manufacturing.master.manage",
                signatureMeaning: "Approved",
              },
            ],
          },
        },
        "BOM_VERSION",
      ),
    ).toEqual([
      {
        sequence: 1,
        permissionKey: "manufacturing.master.manage",
        signatureMeaning: "Approved",
      },
    ]);
  });

  it("reports interim and final progress", () => {
    expect(approvalProgress(2, 1)).toEqual({
      totalStages: 2,
      completedStages: 1,
      nextStage: 2,
      complete: false,
    });
    expect(approvalProgress(2, 2)).toEqual({
      totalStages: 2,
      completedStages: 2,
      nextStage: null,
      complete: true,
    });
  });
});
