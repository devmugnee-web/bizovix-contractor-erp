import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import {
  ManufacturingNavigationConfigurationDialog,
  type ManufacturingNavigationConfigurationGroup,
} from "@/features/screens/manufacturing-navigation-configuration-dialog";
import type { ManufacturingWorkflowConfigurationRecord } from "@/types/manufacturing";

const groups: ManufacturingNavigationConfigurationGroup[] = [
  {
    id: "dashboard",
    code: "A",
    label: "Dashboard & Control Center",
    steps: [
      { id: "dashboard", label: "Manufacturing Dashboard", flowSerial: 1 },
      { id: "alerts", label: "Material Shortage Alerts", flowSerial: 2 },
    ],
  },
  {
    id: "reports",
    code: "K",
    label: "Reports & Audit",
    steps: [
      {
        id: "audit",
        label: "Audit Trail",
        flowSerial: 3,
        prerequisiteFlowSerials: [2],
      },
    ],
  },
];

function configuration(
  hiddenStepSerials: number[],
  revision = 1,
): ManufacturingWorkflowConfigurationRecord {
  const all = [1, 2, 3];
  return {
    workspaceId: "workspace-1",
    workflowDefinitionVersion: "2.0.0",
    totalSteps: all.length,
    hiddenStepSerials,
    enabledStepSerials: all.filter(
      (serial) => !hiddenStepSerials.includes(serial),
    ),
    revision,
    updatedAt: "2026-09-01T10:00:00.000Z",
    updatedByUserId: "user-1",
  };
}

describe("ManufacturingNavigationConfigurationDialog", () => {
  it("renders as an inline page without a modal overlay when requested", () => {
    const onOpenChange = vi.fn();

    const { container } = render(
      <ManufacturingNavigationConfigurationDialog
        presentation="page"
        open
        onOpenChange={onOpenChange}
        groups={groups}
        configuration={configuration([])}
        canConfigure
        isSaving={false}
        onSave={vi.fn()}
      />,
    );

    expect(container.querySelector("[data-manufacturing-configuration-page]")).toBeInTheDocument();
    expect(screen.queryByRole("dialog")).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "Close manufacturing configuration" }));
    expect(onOpenChange).toHaveBeenCalledWith(false);
  });

  it("edits group and child visibility as a sorted hidden-serial payload", () => {
    const onSave = vi.fn();

    render(
      <ManufacturingNavigationConfigurationDialog
        open
        onOpenChange={vi.fn()}
        groups={groups}
        configuration={configuration([2])}
        canConfigure
        isSaving={false}
        onSave={onSave}
      />,
    );

    expect(screen.getByText("Enabled 2 of 3")).toBeInTheDocument();
    const dashboardGroup = screen.getByRole("checkbox", {
      name: "Dashboard & Control Center group",
    }) as HTMLInputElement;
    expect(dashboardGroup).not.toBeChecked();
    expect(dashboardGroup.indeterminate).toBe(true);

    fireEvent.click(
      screen.getByRole("button", {
        name: "Expand Dashboard & Control Center",
      }),
    );
    expect(
      screen.getByRole("checkbox", { name: "Manufacturing Dashboard" }),
    ).toBeChecked();
    expect(
      screen.getByRole("checkbox", { name: "Material Shortage Alerts" }),
    ).not.toBeChecked();

    fireEvent.click(
      screen.getByRole("checkbox", { name: "Manufacturing Dashboard" }),
    );
    fireEvent.click(screen.getByRole("button", { name: "Save configuration" }));

    expect(onSave).toHaveBeenCalledWith([1, 2]);
  });

  it("filters steps without changing the saved draft and can re-enable all", () => {
    const onSave = vi.fn();

    render(
      <ManufacturingNavigationConfigurationDialog
        open
        onOpenChange={vi.fn()}
        groups={groups}
        configuration={configuration([1, 3])}
        canConfigure
        isSaving={false}
        onSave={onSave}
      />,
    );

    fireEvent.change(
      screen.getByRole("textbox", {
        name: "Search manufacturing configuration",
      }),
      { target: { value: "audit" } },
    );

    expect(screen.getByText("Audit Trail")).toBeInTheDocument();
    expect(screen.queryByText("Material Shortage Alerts")).toBeNull();

    fireEvent.click(screen.getByRole("button", { name: "Enable all" }));
    fireEvent.click(screen.getByRole("button", { name: "Save configuration" }));

    expect(onSave).toHaveBeenCalledWith([]);
  });

  it("warns without blocking when an enabled process references a hidden prerequisite", () => {
    const onSave = vi.fn();

    render(
      <ManufacturingNavigationConfigurationDialog
        open
        onOpenChange={vi.fn()}
        groups={groups}
        configuration={configuration([2])}
        canConfigure
        isSaving={false}
        onSave={onSave}
      />,
    );

    expect(screen.getByRole("status")).toHaveTextContent(
      "1 enabled process references hidden prerequisites. Those prerequisites will auto-reveal when required; workflow enforcement is unchanged.",
    );

    fireEvent.click(
      screen.getByRole("checkbox", { name: "Reports & Audit group" }),
    );
    expect(
      screen.getByRole("button", { name: "Save configuration" }),
    ).toBeEnabled();
    fireEvent.click(screen.getByRole("button", { name: "Save configuration" }));
    expect(onSave).toHaveBeenCalledWith([2, 3]);
  });

  it("resets an unsaved draft when the dialog reopens or server data changes", async () => {
    const props = {
      onOpenChange: vi.fn(),
      groups,
      canConfigure: true,
      isSaving: false,
      onSave: vi.fn(),
    };
    const { rerender } = render(
      <ManufacturingNavigationConfigurationDialog
        {...props}
        open
        configuration={configuration([])}
      />,
    );

    fireEvent.click(
      screen.getByRole("checkbox", {
        name: "Dashboard & Control Center group",
      }),
    );
    expect(screen.getByText("Enabled 1 of 3")).toBeInTheDocument();

    rerender(
      <ManufacturingNavigationConfigurationDialog
        {...props}
        open={false}
        configuration={configuration([])}
      />,
    );
    rerender(
      <ManufacturingNavigationConfigurationDialog
        {...props}
        open
        configuration={configuration([])}
      />,
    );
    await waitFor(() =>
      expect(screen.getByText("Enabled 3 of 3")).toBeInTheDocument(),
    );

    rerender(
      <ManufacturingNavigationConfigurationDialog
        {...props}
        open
        configuration={configuration([3], 2)}
      />,
    );
    await waitFor(() =>
      expect(screen.getByText("Enabled 2 of 3")).toBeInTheDocument(),
    );
  });

  it("keeps controls read-only without manufacturing.configure permission", () => {
    render(
      <ManufacturingNavigationConfigurationDialog
        open
        onOpenChange={vi.fn()}
        groups={groups}
        configuration={configuration([2])}
        canConfigure={false}
        isSaving={false}
        onSave={vi.fn()}
      />,
    );

    expect(
      screen.getByText(/manufacturing\.configure permission is required/i),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("checkbox", {
        name: "Dashboard & Control Center group",
      }),
    ).toBeDisabled();
    expect(
      screen.getByRole("button", { name: "Save configuration" }),
    ).toBeDisabled();
  });

  it("does not submit a configuration with every workflow screen hidden", () => {
    render(
      <ManufacturingNavigationConfigurationDialog
        open
        onOpenChange={vi.fn()}
        groups={groups}
        configuration={configuration([1, 2])}
        canConfigure
        isSaving={false}
        onSave={vi.fn()}
      />,
    );

    fireEvent.click(
      screen.getByRole("checkbox", { name: "Reports & Audit group" }),
    );

    expect(
      screen.getByText(
        "Select at least one workflow screen before saving this configuration.",
      ),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "Save configuration" }),
    ).toBeDisabled();
  });
});
