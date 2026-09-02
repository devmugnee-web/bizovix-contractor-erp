import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import ts from "typescript";
import { describe, expect, it } from "vitest";

import {
  manufacturingWorkflowGroups,
  manufacturingWorkflowSteps,
} from "../../../apps/api/src/manufacturing/manufacturing-workflow.catalog";

const projectRoot = process.cwd();
const controlCenterPath = resolve(
  projectRoot,
  "src/features/screens/manufacturing-control-center.tsx",
);
const controlCenterSource = readFileSync(controlCenterPath, "utf8");
const controlCenterAst = ts.createSourceFile(
  controlCenterPath,
  controlCenterSource,
  ts.ScriptTarget.Latest,
  true,
  ts.ScriptKind.TSX,
);

type NavigationGroup = {
  id: string;
  views: Array<{ id: string; label: string }>;
};

function unwrapExpression(expression: ts.Expression): ts.Expression {
  let current = expression;
  while (
    ts.isAsExpression(current) ||
    ts.isSatisfiesExpression(current) ||
    ts.isNonNullExpression(current) ||
    ts.isParenthesizedExpression(current)
  ) {
    current = current.expression;
  }
  return current;
}

function variableInitializer(name: string): ts.Expression {
  let result: ts.Expression | undefined;
  const visit = (node: ts.Node) => {
    if (
      ts.isVariableDeclaration(node) &&
      ts.isIdentifier(node.name) &&
      node.name.text === name
    ) {
      result = node.initializer;
    }
    ts.forEachChild(node, visit);
  };
  visit(controlCenterAst);
  if (!result) throw new Error(`Could not find ${name} in Manufacturing UI.`);
  return unwrapExpression(result);
}

function propertyName(property: ts.ObjectLiteralElementLike) {
  if (!property.name) return "";
  if (
    ts.isIdentifier(property.name) ||
    ts.isStringLiteral(property.name) ||
    ts.isNumericLiteral(property.name)
  ) {
    return property.name.text;
  }
  return property.name.getText(controlCenterAst);
}

function propertyAssignment(object: ts.ObjectLiteralExpression, name: string) {
  const property = object.properties.find(
    (candidate): candidate is ts.PropertyAssignment =>
      ts.isPropertyAssignment(candidate) && propertyName(candidate) === name,
  );
  if (!property) throw new Error(`Could not find property ${name}.`);
  return property;
}

function slug(label: string) {
  return label
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)/g, "");
}

function readGroups(): NavigationGroup[] {
  const initializer = variableInitializer("manufacturingGroups");
  if (!ts.isArrayLiteralExpression(initializer)) {
    throw new Error("manufacturingGroups must remain an array literal.");
  }
  return initializer.elements.map((element) => {
    if (!ts.isObjectLiteralExpression(element)) {
      throw new Error("Every Manufacturing group must be an object literal.");
    }
    const idValue = propertyAssignment(element, "id").initializer;
    const viewsValue = propertyAssignment(element, "views").initializer;
    if (!ts.isStringLiteral(idValue) || !ts.isCallExpression(viewsValue)) {
      throw new Error("Manufacturing group id/views contract changed.");
    }
    const labels = viewsValue.arguments[0];
    if (!labels || !ts.isArrayLiteralExpression(labels)) {
      throw new Error("Manufacturing views must remain a label array.");
    }
    return {
      id: idValue.text,
      views: labels.elements.map((entry) => {
        if (!ts.isStringLiteral(entry)) {
          throw new Error("Manufacturing view labels must be string literals.");
        }
        return { id: slug(entry.text), label: entry.text };
      }),
    };
  });
}

function readObjectKeys(name: string) {
  const initializer = variableInitializer(name);
  if (!ts.isObjectLiteralExpression(initializer)) {
    throw new Error(`${name} must remain an object literal.`);
  }
  return initializer.properties.map(propertyName);
}

describe("Manufacturing navigation contract", () => {
  const groups = readGroups();
  const routes = new Set(
    groups.flatMap((group) =>
      group.views.map((view) => `${group.id}/${view.id}`),
    ),
  );

  it("keeps all 11 workflow groups and 159 unique controlled views", () => {
    expect(
      Object.fromEntries(groups.map((group) => [group.id, group.views.length])),
    ).toEqual({
      dashboard: 7,
      setup: 9,
      masters: 20,
      planning: 12,
      orders: 10,
      materials: 20,
      execution: 18,
      quality: 11,
      packaging: 20,
      costing: 16,
      reports: 16,
    });
    expect(groups).toHaveLength(11);
    expect(routes.size).toBe(159);
    expect(groups.map((group) => group.id)).toEqual([
      "dashboard",
      "setup",
      "masters",
      "planning",
      "orders",
      "materials",
      "execution",
      "quality",
      "packaging",
      "costing",
      "reports",
    ]);

    const globalSteps = groups.flatMap((group) => group.views);
    expect(globalSteps.map((step) => step.label).slice(0, 9)).toEqual([
      "Manufacturing Dashboard",
      "Production Control Center",
      "Pending Approvals",
      "Material Shortage Alerts",
      "Quality & Compliance Alerts",
      "Equipment and Calibration Alerts",
      "Batch Release Queue",
      "Manufacturing Settings",
      "Approval Workflow",
    ]);
    expect(globalSteps[58].label).toBe("Incoming Material Sampling");
    expect(globalSteps[69].label).toBe("Material Issue");
    expect(globalSteps[96].label).toBe("Serialisation — Preallocation");
    expect(globalSteps[120].label).toBe("Finished Goods Receipt");
    expect(globalSteps[125].label).toBe("QA Release");
    expect(globalSteps[158].label).toBe("Data Retention and Archive");
  });

  it("keeps every visible title and route aligned with the versioned 159-step catalog", () => {
    const visibleSteps = groups.flatMap((group) =>
      group.views.map((view) => ({
        title: view.label,
        route: `/app/manufacturing/dashboard?section=${group.id}&view=${view.id}`,
      })),
    );

    expect(visibleSteps).toEqual(
      manufacturingWorkflowSteps.map((step) => ({
        title: step.title,
        route: step.route,
      })),
    );
    expect(
      manufacturingWorkflowGroups.map((group) => group.routeSegment),
    ).toEqual(groups.map((group) => group.id));
    expect(
      manufacturingWorkflowSteps.map((step) => step.legacyStepCode),
    ).toHaveLength(
      new Set(manufacturingWorkflowSteps.map((step) => step.legacyStepCode))
        .size,
    );
  });

  it("keeps section maps, presets and literal navigation targets valid", () => {
    expect(new Set(readObjectKeys("workflowGroupBySection"))).toEqual(
      new Set(groups.map((group) => group.id)),
    );

    for (const mapName of [
      "availabilityViews",
      "itemProfileViews",
      "orderPresets",
    ]) {
      for (const route of readObjectKeys(mapName)) {
        expect(routes.has(route), `${mapName} contains invalid ${route}`).toBe(
          true,
        );
      }
    }

    const literalTargets: string[] = [];
    const visit = (node: ts.Node) => {
      if (
        ts.isCallExpression(node) &&
        ts.isIdentifier(node.expression) &&
        node.expression.text === "openView" &&
        ts.isStringLiteral(node.arguments[0]) &&
        ts.isStringLiteral(node.arguments[1])
      ) {
        literalTargets.push(
          `${node.arguments[0].text}/${node.arguments[1].text}`,
        );
      }
      ts.forEachChild(node, visit);
    };
    visit(controlCenterAst);

    expect(literalTargets.length).toBeGreaterThan(0);
    expect(literalTargets.filter((route) => !routes.has(route))).toEqual([]);
  });

  it("falls back to valid dashboard/view content instead of a 404", () => {
    const requestedCatalogSection = variableInitializer(
      "requestedCatalogSection",
    );
    const requestedCatalogView = variableInitializer("requestedCatalogView");
    const resolvedVisibleTarget = variableInitializer("resolvedVisibleTarget");

    expect(ts.isConditionalExpression(requestedCatalogSection)).toBe(true);
    expect(
      ts.isConditionalExpression(requestedCatalogSection)
        ? requestedCatalogSection.whenFalse.getText(controlCenterAst)
        : "",
    ).toBe('"dashboard"');
    expect(ts.isConditionalExpression(requestedCatalogView)).toBe(true);
    expect(
      ts.isConditionalExpression(requestedCatalogView)
        ? requestedCatalogView.whenFalse.getText(controlCenterAst)
        : "",
    ).toBe("requestedCatalogGroup.views[0].id");
    expect(ts.isCallExpression(resolvedVisibleTarget)).toBe(true);
    expect(
      ts.isCallExpression(resolvedVisibleTarget)
        ? resolvedVisibleTarget.expression.getText(controlCenterAst)
        : "",
    ).toBe("resolveVisibleManufacturingNavigationTarget");
    expect(controlCenterSource).toContain(
      "deriveVisibleManufacturingNavigation(",
    );
    expect(controlCenterSource).toContain(
      'searchParams.get("reveal") === "required"',
    );
    expect(controlCenterSource).toContain(
      'if (requiredByWorkflowSafety) params.set("reveal", "required")',
    );
    expect(controlCenterSource).toContain(
      "const updatedTarget = resolveVisibleManufacturingNavigationTarget(",
    );
    expect(controlCenterSource).toContain("router.replace(");

    expect(controlCenterSource).toContain(
      "<ManufacturingWorkflowReviewWorkspace",
    );
    expect(controlCenterSource).not.toMatch(/\bnotFound\s*\(|\/404\b/);
    expect(
      existsSync(
        resolve(projectRoot, "src/app/app/manufacturing/dashboard/page.tsx"),
      ),
    ).toBe(true);
    expect(
      existsSync(resolve(projectRoot, "src/app/app/masters/[slug]/page.tsx")),
    ).toBe(true);
  });

  it("uses the shared collapsed search and module-only header contract", () => {
    const appShellSource = readFileSync(
      resolve(projectRoot, "src/layouts/app-shell.tsx"),
      "utf8",
    );
    expect(controlCenterSource).toContain("<CollapsibleSearch");
    expect(controlCenterSource).toContain(
      'label="Search manufacturing workflows"',
    );
    expect(appShellSource).toContain("isManufacturingWorkspacePath(");
    expect(appShellSource).toContain(
      "hideGlobalWorkspaceToolbar ? null : <TopHeader mode={mode} />",
    );
  });

  it("does not silently replace an explicitly requested workflow run", () => {
    expect(controlCenterSource).toContain("const activeRun = requestedRunId");
    expect(controlCenterSource).toContain(
      "No different run was selected automatically.",
    );
    expect(controlCenterSource).toContain("requestedRunMissing ||");
    expect(controlCenterSource).toContain(
      'run.nextAction.state !== "COMPLETE"',
    );
  });

  it("keeps every group and step browsable while missing work stays advisory", () => {
    expect(controlCenterSource).toContain(
      "onClick={() => openView(section.id)}",
    );
    expect(controlCenterSource).toContain(
      "onClick={() => openView(activeSection, view.id)}",
    );
    expect(controlCenterSource).not.toContain("disabled={locked}");
    expect(controlCenterSource).not.toContain("activeGroupLocked");
    expect(controlCenterSource).not.toContain(
      "Group {activeGroup.flowCode} is locked",
    );
    expect(controlCenterSource).toContain(
      '["LOCKED", "BLOCKED"].includes(status)',
    );
    expect(controlCenterSource).toContain('"NEEDS ATTENTION"');
  });

  it("shows exact missing-item advisories and their fixing routes", () => {
    expect(controlCenterSource).toContain(
      'activeRun?.nextAction.state === "BLOCKED"',
    );
    expect(controlCenterSource).toContain("Workflow advisory:");
    expect(controlCenterSource).toContain(
      "const fixingStep = activeRun.nextAction.step",
    );
    expect(controlCenterSource).toContain(
      "if (fixingStep) openRunStep(fixingStep)",
    );
    expect(controlCenterSource).toContain(
      "activeRunStep?.missingPrerequisites.length",
    );
    expect(controlCenterSource).toContain(
      "This step needs the following earlier item",
    );
    expect(controlCenterSource).toContain("item.actualStatus");
    expect(controlCenterSource).toContain("item.requiredStatus");
    expect(controlCenterSource).toContain('item.occurrenceKey !== "PRIMARY"');
    expect(controlCenterSource).toContain("onClick={() => openRunStep(item)}");
    expect(controlCenterSource).toMatch(/Mark\s+N\/A\s+with a reason/);
  });

  it("does not demand an invented source record when approving controlled N/A", () => {
    expect(controlCenterSource).toContain("const approvingNotApplicable =");
    expect(controlCenterSource).toContain("!approvingNotApplicable &&");
    expect(controlCenterSource).toContain("activeStepIsPendingNaApproval");
  });

  it("wires both MRP supply suggestions to a dedicated real-data workspace", () => {
    expect(routes.has("planning/suggested-purchase-requisition")).toBe(true);
    expect(routes.has("planning/suggested-stock-transfer")).toBe(true);
    expect(controlCenterSource).toContain(
      'activeView === "suggested-purchase-requisition"',
    );
    expect(controlCenterSource).toContain(
      'activeView === "suggested-stock-transfer"',
    );
    expect(controlCenterSource).toContain(
      "<ManufacturingSupplySuggestionsWorkspace",
    );
    expect(controlCenterSource).toContain("type={supplySuggestionType}");
  });

  it("wires production-order amendments to the controlled order action workspace", () => {
    expect(routes.has("orders/production-order-amendments")).toBe(true);
    expect(readObjectKeys("orderPresets")).toContain(
      "orders/production-order-amendments",
    );
    expect(controlCenterSource).toContain(
      "statuses: [...manufacturingAmendableOrderStatuses]",
    );
    expect(controlCenterSource).toContain('preferredAction: "AMEND"');
  });

  it("routes executable production steps to real order actions", () => {
    const presets = readObjectKeys("orderPresets");
    for (const route of [
      "execution/stage-wise-yield",
      "execution/partial-production-completion",
      "execution/damage-and-scrap",
      "execution/rework-and-reprocessing",
    ]) {
      expect(presets).toContain(route);
    }
    expect(controlCenterSource).toContain(
      'preferredAction: "POST_SCRAP_DISPOSITION"',
    );
    expect(controlCenterSource).toContain(
      'preferredAction: "CREATE_REWORK_DISPOSITION"',
    );
    expect(controlCenterSource).toContain(
      'preferredAction: "COMPLETE_OPERATION"',
    );
    expect(controlCenterSource).toContain(
      'preferredAction: "COMPLETE_PRODUCTION"',
    );
  });

  it("keeps evidence-only execution views on their signed evidence workspace", () => {
    const presets = readObjectKeys("orderPresets");
    for (const route of [
      "execution/operator-handover",
      "execution/electronic-batch-manufacturing-record-ebmr",
    ]) {
      expect(presets).not.toContain(route);
    }
    expect(controlCenterSource).toContain(
      'specializedWorkspaceOwner === "GOVERNANCE"',
    );
  });

  it("routes WIP and bulk-product transfers to the real lot-movement workspace", () => {
    expect(routes.has("execution/wip-transfer")).toBe(true);
    expect(routes.has("execution/bulk-product-transfer")).toBe(true);
    expect(controlCenterSource).toContain(
      "isManufacturingExecutionTransferView(activeView)",
    );
    expect(controlCenterSource).toContain(
      "<ManufacturingExecutionTransferWorkspace",
    );
  });

  it("routes downtime entry to its persisted operation/resource lifecycle", () => {
    expect(routes.has("execution/downtime-entry")).toBe(true);
    expect(controlCenterSource).toContain(
      'routeKey === "execution/downtime-entry"',
    );
    expect(controlCenterSource).toContain("<ManufacturingDowntimeWorkspace");
  });

  it("routes in-process parameter and inspection steps to the real operation-scoped QC action", () => {
    const presets = readObjectKeys("orderPresets");
    for (const route of [
      "execution/process-parameter-entry",
      "execution/in-process-checks",
      "execution/in-process-quality-control",
    ]) {
      expect(presets).toContain(route);
    }
    expect(controlCenterSource).toContain(
      'preferredAction: "RECORD_IN_PROCESS_RESULT"',
    );
  });
});
