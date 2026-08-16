import * as React from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { getApiClientConfig } from "../config";
import { tokenStorage } from "../token-storage";
import type {
  AccountingPeriodRecord,
  CompanyProfileRecord,
  DocumentSettingRecord,
  FinanceAccountOption,
  FinanceSettingRecord,
  GeneralSettingRecord,
  NumberSequenceRecord,
  ReminderRuleRecord,
  SaveAccountingPeriodInput,
  SaveCompanyProfileInput,
  SaveDocumentSettingInput,
  SaveFinanceSettingInput,
  SaveGeneralSettingInput,
  SaveNumberSequenceInput,
  SaveReminderRuleInput,
  SaveSecuritySettingInput,
  SaveSystemSettingInput,
  SaveTenderBankSettingInput,
  SecuritySettingRecord,
  ActiveSessionRecord,
  SystemSettingRecord,
  TenderBankSettingRecord,
} from "@bizovix/types";
import { apiRequest } from "../http-client";

const root = ["settings"] as const;

// General
export const useGeneralSettings = () =>
  useQuery({ queryKey: [...root, "general"], queryFn: () => apiRequest<GeneralSettingRecord>("/settings/general") });
export const useUpdateGeneralSettings = () => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: SaveGeneralSettingInput) => apiRequest<GeneralSettingRecord>("/settings/general", { method: "PUT", body }),
    onSuccess: () => qc.invalidateQueries({ queryKey: root }),
  });
};

// Company profile
export const useCompanyProfile = () =>
  useQuery({ queryKey: [...root, "company"], queryFn: () => apiRequest<CompanyProfileRecord>("/settings/company") });
export const useUpdateCompanyProfile = () => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: SaveCompanyProfileInput) => apiRequest<CompanyProfileRecord>("/settings/company", { method: "PUT", body }),
    onSuccess: () => qc.invalidateQueries({ queryKey: [...root, "company"] }),
  });
};
export function useCompanyAssetUrl(kind: "logo" | "signature" | "seal", enabled: boolean) {
  const [url, setUrl] = React.useState<string | null>(null);
  React.useEffect(() => {
    if (!enabled) {
      setUrl(null);
      return;
    }
    let objectUrl: string | null = null;
    let cancelled = false;
    (async () => {
      const token = tokenStorage.getAccessToken();
      const { baseUrl } = getApiClientConfig();
      const res = await fetch(`${baseUrl.replace(/\/$/, "")}/settings/company/${kind}`, {
        headers: token ? { Authorization: `Bearer ${token}` } : undefined,
      });
      if (!res.ok || cancelled) return;
      const blob = await res.blob();
      objectUrl = URL.createObjectURL(blob);
      if (!cancelled) setUrl(objectUrl);
    })();
    return () => {
      cancelled = true;
      if (objectUrl) URL.revokeObjectURL(objectUrl);
    };
  }, [kind, enabled]);
  return url;
}

export const useUploadCompanyAsset = () => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ kind, file }: { kind: "logo" | "signature" | "seal"; file: File }) => {
      const form = new FormData();
      form.append("file", file);
      return apiRequest<CompanyProfileRecord>(`/settings/company/${kind}`, { method: "PUT", body: form });
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: [...root, "company"] }),
  });
};

// Tender & bank instrument settings
export const useTenderBankSettings = () =>
  useQuery({ queryKey: [...root, "tender-bank"], queryFn: () => apiRequest<TenderBankSettingRecord>("/settings/tender-bank") });
export const useUpdateTenderBankSettings = () => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: SaveTenderBankSettingInput) => apiRequest<TenderBankSettingRecord>("/settings/tender-bank", { method: "PUT", body }),
    onSuccess: () => qc.invalidateQueries({ queryKey: [...root, "tender-bank"] }),
  });
};

// Finance & accounts settings
export const useFinanceSettings = () =>
  useQuery({ queryKey: [...root, "finance"], queryFn: () => apiRequest<FinanceSettingRecord>("/settings/finance") });
export const useFinanceAccountOptions = () =>
  useQuery({ queryKey: [...root, "finance", "accounts"], queryFn: () => apiRequest<FinanceAccountOption[]>("/settings/finance/accounts") });
export const useUpdateFinanceSettings = () => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: SaveFinanceSettingInput) => apiRequest<FinanceSettingRecord>("/settings/finance", { method: "PUT", body }),
    onSuccess: () => qc.invalidateQueries({ queryKey: [...root, "finance"] }),
  });
};
export const useAccountingPeriods = () =>
  useQuery({ queryKey: [...root, "finance", "periods"], queryFn: () => apiRequest<AccountingPeriodRecord[]>("/settings/finance/periods") });
export const useCreateAccountingPeriod = () => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: SaveAccountingPeriodInput) => apiRequest<AccountingPeriodRecord>("/settings/finance/periods", { method: "POST", body }),
    onSuccess: () => qc.invalidateQueries({ queryKey: [...root, "finance", "periods"] }),
  });
};
export const useSetAccountingPeriodStatus = () => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, status }: { id: string; status: "OPEN" | "LOCKED" }) =>
      apiRequest<AccountingPeriodRecord>(`/settings/finance/periods/${id}/status`, { method: "PATCH", body: { status } }),
    onSuccess: () => qc.invalidateQueries({ queryKey: [...root, "finance", "periods"] }),
  });
};

// Numbering
export const useNumberSequences = () =>
  useQuery({ queryKey: [...root, "numbering"], queryFn: () => apiRequest<NumberSequenceRecord[]>("/settings/numbering") });
export const useUpdateNumberSequence = () => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ moduleKey, body }: { moduleKey: string; body: SaveNumberSequenceInput }) =>
      apiRequest<NumberSequenceRecord>(`/settings/numbering/${moduleKey}`, { method: "PUT", body }),
    onSuccess: () => qc.invalidateQueries({ queryKey: [...root, "numbering"] }),
  });
};

// Reminder / notification rules
export const useReminderRules = () =>
  useQuery({ queryKey: [...root, "notifications"], queryFn: () => apiRequest<ReminderRuleRecord[]>("/settings/notifications") });
export const useUpdateReminderRule = () => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ reminderType, body }: { reminderType: string; body: SaveReminderRuleInput }) =>
      apiRequest<ReminderRuleRecord>(`/settings/notifications/${reminderType}`, { method: "PUT", body }),
    onSuccess: () => qc.invalidateQueries({ queryKey: [...root, "notifications"] }),
  });
};

// Document settings
export const useDocumentSettings = () =>
  useQuery({ queryKey: [...root, "documents"], queryFn: () => apiRequest<DocumentSettingRecord>("/settings/documents") });
export const useUpdateDocumentSettings = () => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: SaveDocumentSettingInput) => apiRequest<DocumentSettingRecord>("/settings/documents", { method: "PUT", body }),
    onSuccess: () => qc.invalidateQueries({ queryKey: [...root, "documents"] }),
  });
};

// Security settings
export const useSecuritySettings = () =>
  useQuery({ queryKey: [...root, "security"], queryFn: () => apiRequest<SecuritySettingRecord>("/settings/security") });
export const useUpdateSecuritySettings = () => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: SaveSecuritySettingInput) => apiRequest<SecuritySettingRecord>("/settings/security", { method: "PUT", body }),
    onSuccess: () => qc.invalidateQueries({ queryKey: [...root, "security"] }),
  });
};
export const useActiveSessions = () =>
  useQuery({ queryKey: [...root, "security", "sessions"], queryFn: () => apiRequest<ActiveSessionRecord[]>("/settings/security/sessions") });
export const useRevokeSession = () => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => apiRequest<{ success: boolean }>(`/settings/security/sessions/${id}`, { method: "DELETE" }),
    onSuccess: () => qc.invalidateQueries({ queryKey: [...root, "security", "sessions"] }),
  });
};

// System settings
export const useSystemSettings = () =>
  useQuery({ queryKey: [...root, "system"], queryFn: () => apiRequest<SystemSettingRecord>("/settings/system") });
export const useUpdateSystemSettings = () => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: SaveSystemSettingInput) => apiRequest<SystemSettingRecord>("/settings/system", { method: "PUT", body }),
    onSuccess: () => qc.invalidateQueries({ queryKey: [...root, "system"] }),
  });
};
