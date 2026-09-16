import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type {
  SupportTicketDetail,
  SupportTicketIssueType,
  SupportTicketPriority,
  SupportTicketQuery,
  SupportTicketStatus,
  SupportTicketSummary,
} from "@bizovix/types";
import { apiRequest, apiRequestBlob, apiRequestPaginated } from "../http-client";

const root = ["support-tickets"] as const;

export interface NewSupportTicketInput {
  subject: string;
  issueType: SupportTicketIssueType;
  moduleName: string;
  priority: SupportTicketPriority;
  description: string;
  pagePath?: string;
  appVersion?: string;
  files: File[];
}

function ticketFormData(input: NewSupportTicketInput): FormData {
  const data = new FormData();
  data.append("subject", input.subject);
  data.append("issueType", input.issueType);
  data.append("moduleName", input.moduleName);
  data.append("priority", input.priority);
  data.append("description", input.description);
  if (input.pagePath) data.append("pagePath", input.pagePath);
  if (input.appVersion) data.append("appVersion", input.appVersion);
  input.files.forEach((file) => data.append("files", file));
  return data;
}

export function useSupportTickets(query: SupportTicketQuery = {}, enabled = true) {
  return useQuery({
    queryKey: [...root, "list", query],
    queryFn: () => apiRequestPaginated<SupportTicketSummary>("/support-tickets", {
      params: { page: query.page, limit: query.limit, status: query.status, search: query.search },
    }),
    enabled,
    refetchOnWindowFocus: true,
    refetchInterval: enabled ? 60_000 : false,
  });
}

export function useSupportTicket(id: string | null, enabled = true) {
  return useQuery({
    queryKey: [...root, "detail", id],
    queryFn: () => apiRequest<SupportTicketDetail>(`/support-tickets/${id}`),
    enabled: enabled && !!id,
    refetchOnWindowFocus: true,
    refetchInterval: enabled && id ? 30_000 : false,
  });
}

export function useCreateSupportTicket() {
  const client = useQueryClient();
  return useMutation({
    mutationFn: (input: NewSupportTicketInput) =>
      apiRequest<SupportTicketDetail>("/support-tickets", { method: "POST", body: ticketFormData(input) }),
    onSuccess: () => client.invalidateQueries({ queryKey: root }),
  });
}

export function useReplySupportTicket() {
  const client = useQueryClient();
  return useMutation({
    mutationFn: ({ id, body, files }: { id: string; body: string; files: File[] }) => {
      const data = new FormData();
      data.append("body", body);
      files.forEach((file) => data.append("files", file));
      return apiRequest<SupportTicketDetail>(`/support-tickets/${id}/replies`, { method: "POST", body: data });
    },
    onSuccess: () => client.invalidateQueries({ queryKey: root }),
  });
}

export function useUpdateSupportTicketStatus() {
  const client = useQueryClient();
  return useMutation({
    mutationFn: ({ id, status }: { id: string; status: SupportTicketStatus }) =>
      apiRequest<SupportTicketDetail>(`/support-tickets/${id}/status`, { method: "PATCH", body: { status } }),
    onSuccess: () => client.invalidateQueries({ queryKey: root }),
  });
}

export function downloadSupportAttachment(ticketId: string, attachmentId: string) {
  return apiRequestBlob(`/support-tickets/${ticketId}/attachments/${attachmentId}`);
}
