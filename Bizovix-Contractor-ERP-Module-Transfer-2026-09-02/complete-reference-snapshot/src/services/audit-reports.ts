import { apiRequest } from "@/services/api-client";

export type AuditReportRow = { date: string; user: string; role?: string; action: string; details: string };

export function listAuditReport(slug: string, workspaceId: string) {
  return apiRequest<AuditReportRow[]>(`/reports/${slug}?workspaceId=${encodeURIComponent(workspaceId)}`);
}
