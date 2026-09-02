import { describe, expect, it } from "vitest";

import {
  defaultWorkflowSettings,
  evaluateWorkflowRootAccess,
  isWorkflowSettingsQueryKeyForMode,
  normalizeWorkflowSettings,
  workflowPreset,
} from "@/services/workflow-settings.service";

describe("workflow settings", () => {
  it("uses BOTH as the migration-safe default for existing companies", () => {
    expect(normalizeWorkflowSettings(undefined)).toEqual(defaultWorkflowSettings);
    expect(normalizeWorkflowSettings({ purchaseWorkflow: "invalid", salesWorkflow: null })).toEqual(defaultWorkflowSettings);
  });

  it("recognizes Direct, Advanced, and independently configurable Custom policies", () => {
    expect(workflowPreset({ purchaseWorkflow: "DIRECT", salesWorkflow: "DIRECT" })).toBe("DIRECT");
    expect(workflowPreset({ purchaseWorkflow: "ORDER_BASED", salesWorkflow: "ORDER_BASED" })).toBe("ADVANCED");
    expect(workflowPreset({ purchaseWorkflow: "DIRECT", salesWorkflow: "ORDER_BASED" })).toBe("CUSTOM");
    expect(workflowPreset({ purchaseWorkflow: "BOTH", salesWorkflow: "BOTH" })).toBe("CUSTOM");
  });

  it("fails closed for new roots until workflow settings load successfully", () => {
    expect(evaluateWorkflowRootAccess("BOTH", "DIRECT", "PENDING")).toEqual({
      allowed: false,
      reason: "SETTINGS_PENDING",
    });
    expect(evaluateWorkflowRootAccess("BOTH", "ORDER_BASED", "ERROR")).toEqual({
      allowed: false,
      reason: "SETTINGS_ERROR",
    });
  });

  it("allows only roots supported by the loaded company policy", () => {
    expect(evaluateWorkflowRootAccess("DIRECT", "DIRECT", "READY").allowed).toBe(true);
    expect(evaluateWorkflowRootAccess("DIRECT", "ORDER_BASED", "READY")).toEqual({
      allowed: false,
      reason: "POLICY_MISMATCH",
    });
    expect(evaluateWorkflowRootAccess("ORDER_BASED", "DIRECT", "READY").allowed).toBe(false);
    expect(evaluateWorkflowRootAccess("BOTH", "DIRECT", "READY").allowed).toBe(true);
    expect(evaluateWorkflowRootAccess("BOTH", "ORDER_BASED", "READY").allowed).toBe(true);
  });

  it("matches every cached workspace alias when a company workflow changes", () => {
    expect(isWorkflowSettingsQueryKeyForMode(["api", "workflow-settings", "ws-head-office"], "api")).toBe(true);
    expect(isWorkflowSettingsQueryKeyForMode(["api", "workflow-settings", "ws-showroom"], "api")).toBe(true);
    expect(isWorkflowSettingsQueryKeyForMode(["mock", "workflow-settings", "ws-head-office"], "api")).toBe(false);
    expect(isWorkflowSettingsQueryKeyForMode(["api", "day-book", "ws-head-office"], "api")).toBe(false);
  });
});
