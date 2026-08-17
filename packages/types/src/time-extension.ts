import type { TimeExtensionStatus } from "./enums";

export interface TimeExtensionRecord {
  id: string;
  cmsWorkId: string;
  cmsWork: { id: string; workName: string };
  contractId: string;
  contract: { id: string; contractNo: string; originalCompletionDate: string; currentCompletionDate: string };
  eotNo: string;
  requestDate: string;
  requestedDays: number;
  reason: string;
  description: string | null;
  approvalDate: string | null;
  approvedDays: number | null;
  originalCompletionDate: string;
  previousCompletionDate: string;
  revisedCompletionDate: string | null;
  status: TimeExtensionStatus;
  createdAt: string;
  updatedAt: string;
}

export interface SaveTimeExtensionInput {
  contractId: string;
  requestDate: string;
  requestedDays: number;
  reason: string;
  description?: string;
}
