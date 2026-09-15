import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type {
  ReminderQuery,
  ReminderRecord,
  ReminderRelatedRecordOption,
  ReminderStats,
  SaveReminderInput,
} from "@bizovix/types";
import { apiRequest, apiRequestPaginated } from "../http-client";
const clean = (q: ReminderQuery) =>
  Object.fromEntries(Object.entries(q).filter(([, v]) => v !== "" && v != null)) as Record<
    string,
    string | number
  >;
const root = ["reminders"] as const;
export const useReminders = (q: ReminderQuery) =>
  useQuery({
    queryKey: [...root, "list", q],
    queryFn: () => apiRequestPaginated<ReminderRecord>("/reminders", { params: clean(q) }),
    placeholderData: (p) => p,
  });
export const useReminder = (id?: string | null) =>
  useQuery({
    queryKey: [...root, "one", id],
    queryFn: () => apiRequest<ReminderRecord>(`/reminders/${id}`),
    enabled: !!id,
  });
export const useReminderStats = () =>
  useQuery({
    queryKey: [...root, "stats"],
    queryFn: () => apiRequest<ReminderStats>("/reminders/stats"),
  });
export const useQuickReminders = () =>
  useQuery({
    queryKey: [...root, "quick"],
    queryFn: () =>
      apiRequest<{
        dueToday: ReminderRecord[];
        upcoming: ReminderRecord[];
        overdue: ReminderRecord[];
      }>("/reminders/quick"),
  });
export const useReminderUsers = () =>
  useQuery({
    queryKey: [...root, "users"],
    queryFn: () => apiRequest<Array<{ id: string; name: string }>>("/reminders/users"),
  });
export const useReminderRelatedRecords = (relatedEntityType?: string) =>
  useQuery({
    queryKey: [...root, "related-records", relatedEntityType],
    queryFn: () =>
      apiRequest<ReminderRelatedRecordOption[]>("/reminders/related-records", {
        params: { relatedEntityType },
      }),
    enabled: Boolean(relatedEntityType && relatedEntityType !== "MANUAL"),
  });
function mutation(method: "POST" | "PATCH", path: (v: { id?: string }) => string) {
  return () => {
    const qc = useQueryClient();
    return useMutation({
      mutationFn: (v: { id?: string; body?: unknown }) =>
        apiRequest<ReminderRecord>(path(v), { method, body: v.body }),
      onSuccess: () =>
        Promise.all([
          qc.invalidateQueries({ queryKey: root }),
          qc.invalidateQueries({ queryKey: ["notifications"] }),
        ]),
    });
  };
}
export const useCreateReminder = () => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: SaveReminderInput) =>
      apiRequest<ReminderRecord>("/reminders", { method: "POST", body }),
    onSuccess: () =>
      Promise.all([
        qc.invalidateQueries({ queryKey: root }),
        qc.invalidateQueries({ queryKey: ["notifications"] }),
      ]),
  });
};
export const useUpdateReminder = mutation("PATCH", (v) => `/reminders/${v.id}`);
export const useCompleteReminder = mutation("POST", (v) => `/reminders/${v.id}/complete`);
export const useSnoozeReminder = mutation("POST", (v) => `/reminders/${v.id}/snooze`);
export const useCancelReminder = mutation("POST", (v) => `/reminders/${v.id}/cancel`);
