import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { describe, expect, it } from "vitest";

import {
  buildManufacturingOrderAmendmentPayload,
  manufacturingAmendableOrderStatuses,
  resolveManufacturingOrderAction,
} from "@/features/screens/manufacturing-order-amendment";

const current = {
  plannedQuantity: 10,
  plannedStartDate: "2026-09-01",
  plannedEndDate: "2026-09-30",
  priority: 2,
  notes: "Original plan",
};
const orderWorkspaceSource = readFileSync(
  resolve(
    process.cwd(),
    "src/features/screens/manufacturing-control-center-workspaces.tsx",
  ),
  "utf8",
);

describe("manufacturing production-order amendment UI contract", () => {
  it("offers only lifecycle-safe existing order statuses", () => {
    expect(manufacturingAmendableOrderStatuses).toEqual([
      "DRAFT",
      "SUBMITTED",
      "APPROVED",
      "RESERVED",
    ]);
  });

  it("loads AMEND by default when the amendments route opens an eligible order", () => {
    expect(
      resolveManufacturingOrderAction(
        ["APPROVE", "AMEND", "CANCEL"],
        "",
        "AMEND",
      ),
    ).toBe("AMEND");
    expect(
      resolveManufacturingOrderAction(
        ["APPROVE", "AMEND", "CANCEL"],
        "CANCEL",
        "AMEND",
      ),
    ).toBe("CANCEL");
  });

  it("keeps AMEND and CANCEL fail-closed around reason and signature policy", () => {
    expect(orderWorkspaceSource).toContain('if (selectedAction === "AMEND")');
    expect(orderWorkspaceSource).toContain(
      'selectedAction === "CANCEL" && !note.trim()',
    );
    expect(orderWorkspaceSource).toContain("approvalControlBlocked");
    expect(orderWorkspaceSource).toContain(
      "buildManufacturingOrderAmendmentPayload(",
    );
  });

  it("maps the form to exactly the backend-supported AMEND fields", () => {
    const result = buildManufacturingOrderAmendmentPayload(
      {
        plannedQuantity: "12.5000",
        plannedStartDate: "2026-09-02",
        plannedEndDate: "2026-10-01",
        priority: "5",
        notes: "  Approved revised plan  ",
      },
      current,
    );

    expect(result).toEqual({
      ok: true,
      payload: {
        plannedQuantity: 12.5,
        plannedStartDate: "2026-09-02",
        plannedEndDate: "2026-10-01",
        priority: 5,
        notes: "Approved revised plan",
      },
    });
    if (result.ok) {
      expect(Object.keys(result.payload).sort()).toEqual([
        "notes",
        "plannedEndDate",
        "plannedQuantity",
        "plannedStartDate",
        "priority",
      ]);
    }
  });

  it("rejects a no-op amendment before an API request is sent", () => {
    expect(
      buildManufacturingOrderAmendmentPayload(
        {
          plannedQuantity: "10",
          plannedStartDate: "2026-09-01",
          plannedEndDate: "2026-09-30",
          priority: "2",
          notes: "Original plan",
        },
        current,
      ),
    ).toEqual({
      ok: false,
      message:
        "Change at least one production-order field before recording the amendment.",
    });
  });

  it.each([
    ["0", "Amended planned quantity must be greater than zero."],
    [
      "1.00001",
      "Amended planned quantity must be greater than zero and use no more than four decimal places.",
    ],
  ])("rejects invalid planned quantity %s", (plannedQuantity, message) => {
    expect(
      buildManufacturingOrderAmendmentPayload(
        {
          plannedQuantity,
          plannedStartDate: "2026-09-01",
          plannedEndDate: "2026-09-30",
          priority: "2",
          notes: "Revised",
        },
        current,
      ),
    ).toEqual({ ok: false, message });
  });

  it("blocks invalid dates and priority before submission", () => {
    expect(
      buildManufacturingOrderAmendmentPayload(
        {
          plannedQuantity: "11",
          plannedStartDate: "2026-09-10",
          plannedEndDate: "2026-09-01",
          priority: "2",
          notes: "Revised",
        },
        current,
      ),
    ).toMatchObject({ ok: false });
    expect(
      buildManufacturingOrderAmendmentPayload(
        {
          plannedQuantity: "11",
          plannedStartDate: "2026-02-30",
          plannedEndDate: "2026-09-30",
          priority: "2",
          notes: "Revised",
        },
        current,
      ),
    ).toMatchObject({ ok: false });
    expect(
      buildManufacturingOrderAmendmentPayload(
        {
          plannedQuantity: "11",
          plannedStartDate: "2026-09-01",
          plannedEndDate: "2026-09-30",
          priority: "2.5",
          notes: "Revised",
        },
        current,
      ),
    ).toMatchObject({ ok: false });
  });
});
