import type { StatusBadgeTone } from "@bizovix/ui";
import type { TenderStatus } from "@bizovix/types";

export const TENDER_STATUS_META: Record<TenderStatus, { label: string; tone: StatusBadgeTone }> = {
  DRAFT: { label: "Draft", tone: "neutral" },
  PUBLISHED: { label: "Published", tone: "info" },
  DOCUMENT_PURCHASED: { label: "Document Purchased", tone: "info" },
  PREPARING: { label: "Preparing", tone: "warning" },
  SUBMITTED: { label: "Submitted", tone: "purple" },
  UNDER_PROCESS: { label: "Under Evaluation", tone: "warning" },
  OPENED: { label: "Opened", tone: "info" },
  NOA: { label: "NOA", tone: "purple" },
  AWARDED: { label: "Awarded", tone: "success" },
  ONGOING: { label: "Ongoing", tone: "success" },
  COMPLETED: { label: "Completed", tone: "success" },
  REJECTED: { label: "Unsuccessful", tone: "danger" },
  CANCELLED: { label: "Cancelled", tone: "danger" },
};

export const TENDER_STATUS_OPTIONS: { label: string; value: TenderStatus }[] = (
  Object.keys(TENDER_STATUS_META) as TenderStatus[]
).map((value) => ({ value, label: TENDER_STATUS_META[value].label }));
