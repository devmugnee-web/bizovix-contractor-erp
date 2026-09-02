import { validate } from "class-validator";
import { describe, expect, it } from "vitest";

import {
  CreateManufacturingRunStepOccurrenceDto,
  TransitionManufacturingRunStepDto,
  UpdateManufacturingWorkflowConfigurationDto,
} from "./manufacturing-workflow.dto.js";

describe("manufacturing workflow DTOs", () => {
  it("accepts a scoped repeatable-step occurrence identity", async () => {
    const dto = Object.assign(new CreateManufacturingRunStepOccurrenceDto(), {
      workspaceId: "workspace-1",
      occurrenceKey: "LOT-002",
    });

    await expect(validate(dto, { whitelist: true })).resolves.toEqual([]);
  });

  it("rejects empty and oversized occurrence identities", async () => {
    const empty = Object.assign(new CreateManufacturingRunStepOccurrenceDto(), {
      workspaceId: "",
      occurrenceKey: "",
    });
    const oversized = Object.assign(
      new CreateManufacturingRunStepOccurrenceDto(),
      {
        workspaceId: "workspace-1",
        occurrenceKey: "x".repeat(192),
      },
    );

    expect(await validate(empty)).not.toEqual([]);
    expect(await validate(oversized)).not.toEqual([]);
  });

  it("rejects generic run-step cancellation in favor of domain cancellation", async () => {
    const dto = Object.assign(new TransitionManufacturingRunStepDto(), {
      workspaceId: "workspace-1",
      idempotencyKey: "generic-cancel-attempt",
      action: "CANCEL",
    });

    expect(await validate(dto)).not.toEqual([]);
  });

  it("accepts a versioned workspace workflow visibility configuration", async () => {
    const dto = Object.assign(
      new UpdateManufacturingWorkflowConfigurationDto(),
      {
        workspaceId: "workspace-1",
        workflowDefinitionVersion: "2",
        hiddenStepSerials: [7, 39, 144],
        expectedRevision: 0,
      },
    );

    await expect(validate(dto)).resolves.toEqual([]);
  });

  it("rejects duplicate, out-of-range and invalid visibility revisions", async () => {
    const dto = Object.assign(
      new UpdateManufacturingWorkflowConfigurationDto(),
      {
        workspaceId: "workspace-1",
        workflowDefinitionVersion: "2",
        hiddenStepSerials: [0, 7, 7, 160],
        expectedRevision: -1,
      },
    );

    expect(await validate(dto)).not.toEqual([]);
  });
});
