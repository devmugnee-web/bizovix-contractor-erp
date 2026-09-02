import { describe, expect, it } from "vitest";

import {
  deriveVisibleManufacturingNavigation,
  resolveVisibleManufacturingNavigationTarget,
} from "./manufacturing-workflow-visibility";

const catalog = [
  {
    id: "dashboard",
    label: "Group A",
    views: [
      { id: "overview", label: "Overview" },
      { id: "alerts", label: "Alerts" },
    ],
  },
  {
    id: "masters",
    label: "Group B",
    views: [
      { id: "products", label: "Products" },
      { id: "bom", label: "BOM" },
    ],
  },
] as const;

describe("manufacturing workflow presentation visibility", () => {
  it("shows the complete catalog by default with stable global serials", () => {
    const groups = deriveVisibleManufacturingNavigation(catalog);

    expect(groups.map((group) => group.id)).toEqual(["dashboard", "masters"]);
    expect(groups.flatMap((group) => group.views)).toMatchObject([
      { id: "overview", flowSerial: 1 },
      { id: "alerts", flowSerial: 2 },
      { id: "products", flowSerial: 3 },
      { id: "bom", flowSerial: 4 },
    ]);
  });

  it("can hide an entire group without renumbering later steps", () => {
    const groups = deriveVisibleManufacturingNavigation(catalog, {
      hiddenFlowSerials: [1, 2],
    });

    expect(groups).toHaveLength(1);
    expect(groups[0].id).toBe("masters");
    expect(groups[0].views.map((view) => view.flowSerial)).toEqual([3, 4]);
  });

  it("re-enables a step and leaves newly appended catalog steps visible", () => {
    const extendedCatalog = [
      ...catalog,
      {
        id: "reports",
        label: "Group C",
        views: [{ id: "audit", label: "Audit" }],
      },
    ] as const;

    const hidden = deriveVisibleManufacturingNavigation(extendedCatalog, {
      hiddenFlowSerials: [2],
    });
    expect(
      hidden.flatMap((group) => group.views).map((view) => view.id),
    ).toEqual(["overview", "products", "bom", "audit"]);
    expect(
      hidden
        .flatMap((group) => group.views)
        .find((view) => view.id === "audit"),
    ).toMatchObject({ flowSerial: 5, configuredHidden: false });

    const reEnabled = deriveVisibleManufacturingNavigation(extendedCatalog, {
      hiddenFlowSerials: [],
    });
    expect(
      reEnabled
        .flatMap((group) => group.views)
        .find((view) => view.id === "alerts"),
    ).toMatchObject({ flowSerial: 2, configuredHidden: false });
  });

  it("temporarily reveals a configured-hidden step required by an active run", () => {
    const groups = deriveVisibleManufacturingNavigation(catalog, {
      hiddenFlowSerials: [2],
      forcedVisibleFlowSerials: [2],
    });
    const alerts = groups
      .flatMap((group) => group.views)
      .find((view) => view.id === "alerts");

    expect(alerts).toMatchObject({
      flowSerial: 2,
      configuredHidden: true,
      forcedVisible: true,
      safetyFallback: false,
    });
  });

  it("falls back from a hidden current view to the same group's first visible view", () => {
    const groups = deriveVisibleManufacturingNavigation(catalog, {
      hiddenFlowSerials: [1],
    });

    expect(
      resolveVisibleManufacturingNavigationTarget(groups, {
        section: "dashboard",
        view: "overview",
      }),
    ).toEqual({ section: "dashboard", view: "alerts", flowSerial: 2 });
  });

  it("falls back to the first visible catalog target when a whole group is hidden", () => {
    const groups = deriveVisibleManufacturingNavigation(catalog, {
      hiddenFlowSerials: [1, 2],
    });

    expect(
      resolveVisibleManufacturingNavigationTarget(groups, {
        section: "dashboard",
        view: "overview",
      }),
    ).toEqual({ section: "masters", view: "products", flowSerial: 3 });
  });

  it("keeps one safe route target when every configured option is hidden", () => {
    const groups = deriveVisibleManufacturingNavigation(catalog, {
      hiddenFlowSerials: [1, 2, 3, 4],
    });

    expect(groups).toHaveLength(1);
    expect(groups[0].views).toEqual([
      expect.objectContaining({
        id: "overview",
        flowSerial: 1,
        configuredHidden: true,
        safetyFallback: true,
      }),
    ]);
    expect(resolveVisibleManufacturingNavigationTarget(groups)).toEqual({
      section: "dashboard",
      view: "overview",
      flowSerial: 1,
    });
  });
});
