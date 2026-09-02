import { describe, expect, it } from "vitest";

import { manufacturingWorkflowReviewTransitionActions } from "@/features/screens/manufacturing-control-center-workspaces";

describe("manufacturing workflow-review transitions", () => {
  it("offers the controlled two-stage review sequence and closes terminal records", () => {
    expect(manufacturingWorkflowReviewTransitionActions("PENDING")).toEqual([
      "REVIEW",
      "REJECT",
    ]);
    expect(manufacturingWorkflowReviewTransitionActions("REVIEWED")).toEqual([
      "APPROVE",
      "REJECT",
    ]);
    expect(manufacturingWorkflowReviewTransitionActions("APPROVED")).toEqual(
      [],
    );
    expect(manufacturingWorkflowReviewTransitionActions("REJECTED")).toEqual(
      [],
    );
  });
});
