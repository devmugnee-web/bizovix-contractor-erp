import { getDataProvider } from "@/services/data-provider";
import type { DataMode } from "@/types/domain";

export function getTrialBalance(mode: DataMode, workspaceId: string) {
  return getDataProvider(mode).reports.getTrialBalance(workspaceId);
}
