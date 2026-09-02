import { describe, expect, it, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";

import {
  PartyFormDialog,
  cloneDefaultPartySettings,
  createDefaultPartyFormState,
} from "@/features/parties/party-form-dialog";

/** The voucher screens and the masters screen now share one party form, so the
 * contract that matters is: it opens on the seed it was given, and a save hands the
 * caller a record without any navigation. */
describe("PartyFormDialog", () => {
  function renderDialog(overrides: Partial<Parameters<typeof PartyFormDialog>[0]> = {}) {
    const onSaved = vi.fn();
    const onOpenChange = vi.fn();
    render(
      <PartyFormDialog
        open
        onOpenChange={onOpenChange}
        mode="mock"
        workspaceId="workspace-1"
        seed={{ ...createDefaultPartyFormState("supplier"), name: "Raduga Traders" }}
        editingParty={null}
        settings={cloneDefaultPartySettings()}
        onSettingsChange={() => {}}
        onSaved={onSaved}
        {...overrides}
      />,
    );
    return { onSaved, onOpenChange };
  }

  it("opens on the seeded name so a voucher does not make the operator retype it", () => {
    renderDialog();
    expect(screen.getByDisplayValue("Raduga Traders")).toBeTruthy();
    expect(screen.getByText("Add Supplier")).toBeTruthy();
  });

  it("hides the party-type toggle and Save & New when the caller locks the context", () => {
    renderDialog({ lockType: true, showSaveAndNew: false });
    expect(screen.queryByRole("button", { name: "Customer" })).toBeNull();
    expect(screen.queryByRole("button", { name: /Save & New/ })).toBeNull();
  });

  it("hands the saved party back to the caller and closes, with no navigation", async () => {
    const { onSaved, onOpenChange } = renderDialog();
    fireEvent.click(screen.getByRole("button", { name: /^Save$/ }));
    await vi.waitFor(() => expect(onSaved).toHaveBeenCalledTimes(1));

    const [party, context] = onSaved.mock.calls[0];
    expect(party.name).toBe("Raduga Traders");
    expect(party.type).toBe("supplier");
    expect(context.previous).toBeNull();
    expect(context.keepOpen).toBe(false);
    expect(onOpenChange).toHaveBeenCalledWith(false);
  });

  it("refuses to save a party with no name", async () => {
    const { onSaved } = renderDialog({ seed: createDefaultPartyFormState("customer") });
    const saveButton = screen.getByRole("button", { name: /^Save$/ }) as HTMLButtonElement;
    expect(saveButton.disabled).toBe(true);
    expect(onSaved).not.toHaveBeenCalled();
  });
});
