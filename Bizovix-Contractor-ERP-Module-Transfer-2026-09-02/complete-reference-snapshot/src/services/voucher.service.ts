import { getDataProvider } from "@/services/data-provider";
import { apiRequest } from "@/services/api-client";
import { validateVoucherInput } from "@/lib/accounting";
import { useSessionStore } from "@/stores/session-store";
import type { DataMode, DayBookFilters, VoucherFormInput, VoucherRecord } from "@/types/domain";

export async function listDayBook(mode: DataMode, filters: DayBookFilters) {
  const vouchers = await getDataProvider(mode).vouchers.listDayBook(filters);
  return [...vouchers].sort((left, right) =>
    right.createdAt.localeCompare(left.createdAt) ||
    right.voucherDate.localeCompare(left.voucherDate) ||
    right.id.localeCompare(left.id),
  );
}

export function getVoucher(mode: DataMode, voucherId: string, workspaceId: string) {
  return getDataProvider(mode).vouchers.getById(voucherId, workspaceId);
}

export async function createVoucher(mode: DataMode, input: VoucherFormInput) {
  const normalizedInput = validateVoucherInput(input).input;

  if (mode === "api" && requiresApprovalWorkflow(normalizedInput.status)) {
    const draft = await getDataProvider(mode).vouchers.create({ ...normalizedInput, status: "draft" });
    // A brand-new voucher, unlike one being edited, has no prior life to preserve —
    // if it can't reach the requested status, undo the create entirely (see
    // bringToRequestedStatus) rather than leaving a half-created draft/pending row
    // in the list for the user to notice and clean up by hand.
    return bringToRequestedStatus(draft, normalizedInput.status, { rollbackOnFailure: true });
  }

  return getDataProvider(mode).vouchers.create(normalizedInput);
}

export async function updateVoucher(mode: DataMode, voucherId: string, input: VoucherFormInput) {
  const normalizedInput = validateVoucherInput(input).input;

  if (mode === "api" && requiresApprovalWorkflow(normalizedInput.status)) {
    const draft = await getDataProvider(mode).vouchers.update(voucherId, { ...normalizedInput, status: "draft" });
    return bringToRequestedStatus(draft, normalizedInput.status);
  }

  return getDataProvider(mode).vouchers.update(voucherId, normalizedInput);
}

// The real API enforces a submit -> approve workflow: a voucher can't be created or
// updated straight into POSTED/APPROVED, so we save it as a draft first and then walk
// it through that workflow here, once, instead of every screen having to know about it.
function requiresApprovalWorkflow(status: VoucherFormInput["status"]) {
  return status === "posted" || status === "approved";
}

async function bringToRequestedStatus(
  voucher: VoucherRecord,
  requestedStatus: VoucherFormInput["status"],
  options?: { rollbackOnFailure?: boolean },
) {
  let current = voucher;

  try {
    current = await submitVoucherForPosting(current.id);
    if (requestedStatus === "approved") {
      return current;
    }

    const currentUser = useSessionStore.getState().appSession?.user;
    const canPost = currentUser?.role === "Owner"
      || currentUser?.permissions === undefined
      || currentUser.permissions.includes("accounting.voucher.post");
    if (!canPost) {
      // Staff-created entries stop safely at Pending. A Manager/Accountant can
      // review and post them from their own session; do not turn a valid submit
      // into a failed save or attempt a delete the creator is not allowed to do.
      return current;
    }

    current = await approveVoucherPosting(current.id);
  } catch (error) {
    const reason = error instanceof Error ? error.message : "Voucher could not reach the requested status.";

    if (options?.rollbackOnFailure) {
      try {
        await deleteVoucher("api", current.id, current.workspaceId);
      } catch {
        // Surfacing the real posting error below matters more than a failed cleanup.
      }
      throw new Error(reason, { cause: error });
    }

    // Editing an existing voucher: it had a life before this edit, so undoing it by
    // deleting isn't safe — leave it wherever the workflow got to and let the caller
    // see the real status/reason on the returned record instead of failing outright.
    return { ...current, postingStallReason: reason };
  }

  return current;
}

export function deleteVoucher(mode: DataMode, voucherId: string, workspaceId: string) {
  return getDataProvider(mode).vouchers.delete(voucherId, workspaceId);
}

export function resetDeleteSalesInvoice(voucherId: string, workspaceId: string) {
  return apiRequest<VoucherRecord & { deletedLinkedCount: number }>(
    `/vouchers/${encodeURIComponent(voucherId)}/reset-sales-invoice?workspaceId=${encodeURIComponent(workspaceId)}`,
    { method: "DELETE" },
  );
}

// Real API accounts enforce a submit -> approve workflow before a voucher becomes
// POSTED; local/demo modes have no such restriction, so these are api-only helpers.
export function submitVoucherForPosting(voucherId: string) {
  return apiRequest<VoucherRecord>(`/vouchers/${encodeURIComponent(voucherId)}/submit`, { method: "POST" });
}

export function approveVoucherPosting(voucherId: string) {
  return apiRequest<VoucherRecord>(`/vouchers/${encodeURIComponent(voucherId)}/approve`, { method: "POST" });
}

export function rejectVoucherPosting(voucherId: string) {
  return apiRequest<VoucherRecord>(`/vouchers/${encodeURIComponent(voucherId)}/reject`, { method: "POST" });
}

/**
 * Cancels through the guarded status transition rather than rewriting the whole
 * voucher, so nothing else about the document can change on the way.
 */
export function cancelVoucher(voucherId: string) {
  return apiRequest<VoucherRecord>(`/vouchers/${encodeURIComponent(voucherId)}/cancel`, { method: "POST" });
}

// A posted voucher has already moved money/stock in the ledger, so it can never be
// deleted outright — that would erase the audit trail. Reversing it posts a mirror-image
// voucher that cancels the original out, leaving both entries visible in the day book.
export function reverseVoucher(voucherId: string, reason?: string) {
  return apiRequest<VoucherRecord>(`/vouchers/${encodeURIComponent(voucherId)}/reverse`, {
    method: "POST",
    body: JSON.stringify({ reason }),
  });
}
