import { getDataProvider } from "@/services/data-provider";
import type { DataMode } from "@/types/domain";

export function getDashboard(mode: DataMode, workspaceId: string) {
  return getDataProvider(mode).dashboard.get(workspaceId);
}
