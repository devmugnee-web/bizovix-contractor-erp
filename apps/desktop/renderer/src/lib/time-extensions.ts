import type { StatusBadgeTone } from "@bizovix/ui";
import type { TimeExtensionStatus } from "@bizovix/types";

export const EOT_STATUS_META: Record<TimeExtensionStatus, { label: string; tone: StatusBadgeTone }> = {
  DRAFT: { label: "Draft", tone: "neutral" },
  SUBMITTED: { label: "Submitted", tone: "purple" },
  APPROVED: { label: "Approved", tone: "success" },
  REJECTED: { label: "Rejected", tone: "danger" },
  CANCELLED: { label: "Cancelled", tone: "danger" },
};
