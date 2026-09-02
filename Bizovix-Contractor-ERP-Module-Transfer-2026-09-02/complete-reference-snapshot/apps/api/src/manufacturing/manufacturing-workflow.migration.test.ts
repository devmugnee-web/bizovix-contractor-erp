import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { describe, expect, it } from "vitest";

import {
  manufacturingStepDependencies,
  manufacturingWorkflowGroups,
  manufacturingWorkflowSteps,
} from "./manufacturing-workflow.catalog.js";

const migration = readFileSync(
  resolve(
    process.cwd(),
    "prisma/migrations/20260830204000_add_manufacturing_workflow_orchestrator/migration.sql",
  ),
  "utf8",
);
const v2Migration = readFileSync(
  resolve(
    process.cwd(),
    "prisma/migrations/20260901153000_add_manufacturing_workflow_v2/migration.sql",
  ),
  "utf8",
);

function section(start: string, end: string) {
  const from = migration.indexOf(start);
  const to = migration.indexOf(end, from + start.length);
  if (from < 0 || to < 0)
    throw new Error(`Migration section ${start} is missing.`);
  return migration.slice(from, to);
}

describe("A-to-K workflow migration contract", () => {
  it("installs the exact catalog serial, legacy-code and title mapping", () => {
    const rows = [
      ...section(
        'WITH raw("flowSerial", "legacyStepCode", "title") AS (VALUES',
        "), shaped AS (",
      ).matchAll(/\((\d+),\s*'([^']+)',\s*'([^']+)'\)/g),
    ].map((match) => [Number(match[1]), match[2], match[3]]);

    expect(rows).toEqual(
      manufacturingWorkflowSteps.map((step) => [
        step.flowSerial,
        step.legacyStepCode,
        step.title,
      ]),
    );
    expect(rows).toHaveLength(159);
  });

  it("keeps the immutable v1 dependency graph as its historical mapping", () => {
    const rows = [
      ...section(
        "WITH raw(step_serial, prerequisite_serial, dependency_type) AS (VALUES",
        ')\nINSERT INTO "ManufacturingStepDependency"',
      ).matchAll(/\((\d+),(\d+),'([^']+)'\)/g),
    ].map((match) => `${match[1]}:${match[2]}:${match[3]}`);
    const currentCatalog = manufacturingStepDependencies.map(
      (dependency) =>
        `${dependency.stepSerial}:${dependency.prerequisiteStepSerial}:${dependency.dependencyType}`,
    );
    const historicalCatalog = currentCatalog
      .filter((dependency) => dependency !== "155:143:HARD")
      .concat(
        Array.from({ length: 11 }, (_, index) => `155:${144 + index}:HARD`),
        "156:154:HARD",
      );

    expect(new Set(rows)).toEqual(new Set(historicalCatalog));
    expect(rows).toHaveLength(218);
  });

  it("keeps real-material-only packaging issue conditional in persisted metadata", () => {
    expect(
      manufacturingWorkflowSteps.find((step) => step.flowSerial === 113),
    ).toMatchObject({ applicabilityType: "CONDITIONAL", repeatable: true });
    expect(migration).toMatch(
      /WHEN "flowSerial" IN \([^)]*\b113\b[^)]*\) THEN 'CONDITIONAL'/,
    );
  });

  it("keeps the no-change order-amendment branch conditional", () => {
    expect(
      manufacturingWorkflowSteps.find((step) => step.flowSerial === 54),
    ).toMatchObject({ applicabilityType: "CONDITIONAL" });
    expect(migration).toMatch(
      /WHEN "flowSerial" IN \([^)]*\b54\b[^)]*\) THEN 'CONDITIONAL'/,
    );
  });

  it("is reference-only, fail-closed and never touches protected accounts", () => {
    expect(manufacturingWorkflowGroups).toHaveLength(11);
    expect(migration).toContain("expected 11 groups");
    expect(migration).toContain("expected 159 steps");
    expect(migration).toContain("global serial has a gap");
    expect(migration).toContain("duplicate legacy step codes");
    expect(migration).toContain("dependencies contain a cycle");
    expect(migration).not.toMatch(
      /(?:INSERT|UPDATE|DELETE)\s+(?:INTO\s+|FROM\s+)?"Account"/i,
    );
    for (const businessTable of [
      "ManufacturingOrder",
      "ManufacturingPlan",
      "ManufacturingTransaction",
      "StockMovement",
      "VoucherEntry",
      "ManufacturingSerial",
      "ManufacturingQualityInspection",
    ]) {
      expect(migration).not.toContain(`INSERT INTO "${businessTable}"`);
    }
  });

  it("pins historical versions and prevents parallel runs for one order", () => {
    expect(migration).toContain(
      'CREATE UNIQUE INDEX "ManufacturingRun_workspaceId_productionOrderId_key"',
    );
    expect(migration).toContain(
      'CREATE TRIGGER "ManufacturingWorkflowDefinition_append_only"',
    );
    expect(migration).toContain(
      'CREATE TRIGGER "ManufacturingWorkflowGroup_append_only"',
    );
    expect(migration).toContain(
      'CREATE TRIGGER "ManufacturingWorkflowStepDefinition_append_only"',
    );
    expect(migration).toContain(
      'CREATE TRIGGER "ManufacturingStepDependency_append_only"',
    );
    expect(migration).toContain(
      'CREATE TRIGGER "ManufacturingRunStep_definition_guard"',
    );
    expect(migration).toContain(
      "Non-repeatable manufacturing steps only allow the PRIMARY occurrence",
    );
    expect(migration).toContain(
      "Manufacturing run step must use the workflow definition pinned to its run",
    );
    expect(migration).toContain(
      "A workflow definition used by a manufacturing run is immutable; install a new version",
    );
    expect(migration).toContain(
      "Manufacturing workflow dependencies cannot cross definition versions",
    );
  });

  it("defaults new run steps to READY so navigation is never initialized as locked", () => {
    expect(migration).toContain(
      '"status" "ManufacturingWorkflowStepStatus" NOT NULL DEFAULT \'READY\'',
    );
  });
});

describe("A-to-K workflow v2 append-only migration contract", () => {
  it("copies v1 into a new active v2 definition without rewriting v1", () => {
    expect(v2Migration).toContain("'mwf-a-k-v2', 2, true");
    expect(v2Migration).toContain(
      'FROM "ManufacturingWorkflowDefinition"\nWHERE "id" = \'mwf-a-k-v1\' AND "version" = 1',
    );
    expect(v2Migration).not.toMatch(
      /\b(?:UPDATE|DELETE\s+FROM)\s+"ManufacturingWorkflow(?:Definition|Group|StepDefinition)"/i,
    );
  });

  it("makes generated reports observational and removes their close-out gates", () => {
    for (let serial = 144; serial <= 154; serial += 1) {
      expect(
        manufacturingWorkflowSteps.find((step) => step.flowSerial === serial),
      ).toMatchObject({ applicabilityType: "MONITORING", isBlocking: false });
    }
    expect(
      manufacturingStepDependencies.some(
        (dependency) =>
          dependency.stepSerial === 155 &&
          dependency.prerequisiteStepSerial >= 144 &&
          dependency.prerequisiteStepSerial <= 154,
      ),
    ).toBe(false);
    expect(manufacturingStepDependencies).toContainEqual(
      expect.objectContaining({
        stepSerial: 155,
        prerequisiteStepSerial: 143,
        dependencyType: "HARD",
      }),
    );
    expect(v2Migration).toContain(
      'target."flowSerial" = 155\n    AND prerequisite."flowSerial" BETWEEN 144 AND 154',
    );
    expect(v2Migration).toContain("'mwfd-a-k-v2-155-143-hard'");
  });

  it("persists mode and conditional applicability from the v2 catalog", () => {
    expect(
      manufacturingWorkflowSteps.find((step) => step.flowSerial === 11),
    ).toMatchObject({
      applicabilityType: "CONDITIONAL",
      allowedModes: ["GENERAL", "PHARMACEUTICAL", "HYBRID"],
    });
    expect(
      manufacturingWorkflowSteps.find((step) => step.flowSerial === 108),
    ).toMatchObject({ applicabilityType: "CONDITIONAL" });
    expect(v2Migration).toMatch(/11,20,39,43,44,45/);
    expect(v2Migration).toContain(
      'step."flowSerial" IN (7,55,56,57,58,59,60,61,62,80,111,123,124,125,155)',
    );
  });

  it("inserts only workflow reference rows and no protected or business data", () => {
    const insertedTables = [
      ...v2Migration.matchAll(/INSERT INTO\s+"([^"]+)"/g),
    ].map((match) => match[1]);
    expect(new Set(insertedTables)).toEqual(
      new Set([
        "ManufacturingWorkflowDefinition",
        "ManufacturingWorkflowGroup",
        "ManufacturingWorkflowStepDefinition",
        "ManufacturingStepDependency",
      ]),
    );
    expect(v2Migration).not.toContain('"Account"');
    expect(v2Migration).toContain("expected 207 dependencies");
  });
});
