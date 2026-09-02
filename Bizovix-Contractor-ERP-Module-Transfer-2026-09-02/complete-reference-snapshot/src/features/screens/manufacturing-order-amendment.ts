import type {
  ManufacturingJsonObject,
  ManufacturingOrderActionKind,
  ManufacturingOrderStatus,
} from "@/types/manufacturing";

export const manufacturingAmendableOrderStatuses = [
  "DRAFT",
  "SUBMITTED",
  "APPROVED",
  "RESERVED",
] as const satisfies readonly ManufacturingOrderStatus[];

export type ManufacturingOrderAmendmentDraft = {
  plannedQuantity: string;
  plannedStartDate: string;
  plannedEndDate: string;
  priority: string;
  notes: string;
};

export type ManufacturingOrderAmendmentSnapshot = {
  plannedQuantity: number;
  plannedStartDate: string;
  plannedEndDate: string;
  priority: number;
  notes: string | null;
};

export type ManufacturingOrderAmendmentPayload = ManufacturingJsonObject & {
  plannedQuantity: number;
  plannedStartDate: string;
  plannedEndDate: string;
  priority: number;
  notes: string | null;
};

export type ManufacturingOrderAmendmentResult =
  | { ok: true; payload: ManufacturingOrderAmendmentPayload }
  | { ok: false; message: string };

const quantityPattern = /^\d+(?:\.\d{1,4})?$/;
const datePattern = /^\d{4}-\d{2}-\d{2}$/;

function dateOnly(value: string) {
  return value.slice(0, 10);
}

function isDateOnly(value: string) {
  if (!datePattern.test(value)) return false;
  const parsed = new Date(`${value}T00:00:00.000Z`);
  return (
    !Number.isNaN(parsed.getTime()) &&
    parsed.toISOString().slice(0, 10) === value
  );
}

export function resolveManufacturingOrderAction(
  availableActions: ManufacturingOrderActionKind[],
  selectedAction: ManufacturingOrderActionKind | "",
  preferredAction?: ManufacturingOrderActionKind,
) {
  if (selectedAction && availableActions.includes(selectedAction)) {
    return selectedAction;
  }
  if (preferredAction && availableActions.includes(preferredAction)) {
    return preferredAction;
  }
  return availableActions[0];
}

/**
 * Builds the exact payload allowlisted by the Manufacturing API for AMEND.
 * Keeping this conversion in one pure function prevents UI-only fields from
 * leaking into the controlled lifecycle request.
 */
export function buildManufacturingOrderAmendmentPayload(
  draft: ManufacturingOrderAmendmentDraft,
  current: ManufacturingOrderAmendmentSnapshot,
): ManufacturingOrderAmendmentResult {
  const quantityText = draft.plannedQuantity.trim();
  if (!quantityPattern.test(quantityText)) {
    return {
      ok: false,
      message:
        "Amended planned quantity must be greater than zero and use no more than four decimal places.",
    };
  }
  const plannedQuantity = Number(quantityText);
  if (!Number.isFinite(plannedQuantity) || plannedQuantity <= 0) {
    return {
      ok: false,
      message: "Amended planned quantity must be greater than zero.",
    };
  }

  const priorityText = draft.priority.trim();
  const priority = Number(priorityText);
  if (
    !/^\d+$/.test(priorityText) ||
    !Number.isInteger(priority) ||
    priority < 0 ||
    priority > 9999
  ) {
    return {
      ok: false,
      message: "Amended priority must be a whole number from 0 to 9999.",
    };
  }

  const plannedStartDate = draft.plannedStartDate.trim();
  const plannedEndDate = draft.plannedEndDate.trim();
  if (
    !isDateOnly(plannedStartDate) ||
    !isDateOnly(plannedEndDate) ||
    plannedEndDate < plannedStartDate
  ) {
    return {
      ok: false,
      message:
        "Select valid planned dates; the end date cannot be before the start date.",
    };
  }

  const notes = draft.notes.trim() || null;
  if ((notes?.length ?? 0) > 5000) {
    return {
      ok: false,
      message: "Amended order notes cannot exceed 5000 characters.",
    };
  }

  const payload: ManufacturingOrderAmendmentPayload = {
    plannedQuantity,
    plannedStartDate,
    plannedEndDate,
    priority,
    notes,
  };
  const changed =
    payload.plannedQuantity !== current.plannedQuantity ||
    payload.plannedStartDate !== dateOnly(current.plannedStartDate) ||
    payload.plannedEndDate !== dateOnly(current.plannedEndDate) ||
    payload.priority !== current.priority ||
    payload.notes !== (current.notes?.trim() || null);
  if (!changed) {
    return {
      ok: false,
      message:
        "Change at least one production-order field before recording the amendment.",
    };
  }

  return { ok: true, payload };
}
