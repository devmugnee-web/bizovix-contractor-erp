import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type {
  CreateVatTaxCertificateInput,
  UpdateVatTaxCertificateInput,
  VatTaxCertificateExport,
  VatTaxCertificateExportQuery,
  VatTaxCertificateQuery,
  VatTaxCertificateRecentQuery,
  VatTaxCertificateRecord,
  VatTaxCertificateStats,
  VatTaxCertificateStatsQuery,
} from "@bizovix/types";
import { apiRequest, apiRequestPaginated } from "../http-client";
import { queryKeys } from "./query-keys";

const basePath = "/vat-tax-certificates";

export function useVatTaxCertificates(query: VatTaxCertificateQuery, enabled = true) {
  return useQuery({
    queryKey: queryKeys.vatTaxCertificates(query),
    queryFn: () =>
      apiRequestPaginated<VatTaxCertificateRecord>(basePath, {
        params: { ...query },
      }),
    placeholderData: (previous) => previous,
    enabled,
  });
}

export function useVatTaxCertificate(id: string | undefined) {
  return useQuery({
    queryKey: queryKeys.vatTaxCertificate(id ?? ""),
    queryFn: () => apiRequest<VatTaxCertificateRecord>(basePath + "/" + id),
    enabled: !!id,
  });
}

export function useVatTaxCertificateStats(
  query: VatTaxCertificateStatsQuery = {},
  enabled = true,
) {
  return useQuery({
    queryKey: queryKeys.vatTaxCertificateStats(query),
    queryFn: () =>
      apiRequest<VatTaxCertificateStats>(basePath + "/stats", {
        params: { ...query },
      }),
    enabled,
  });
}

export function useRecentVatTaxCertificates(query: VatTaxCertificateRecentQuery = {}) {
  return useQuery({
    queryKey: queryKeys.vatTaxCertificateRecent(query),
    queryFn: () =>
      apiRequest<VatTaxCertificateRecord[]>(basePath + "/recent", {
        params: { ...query },
      }),
  });
}

export function useExportVatTaxCertificates() {
  return useMutation({
    mutationFn: (query: VatTaxCertificateExportQuery) =>
      apiRequest<VatTaxCertificateExport>(basePath + "/export", {
        params: { ...query },
      }),
  });
}

function useInvalidateVatTaxCertificates() {
  const queryClient = useQueryClient();
  return () =>
    Promise.all([
      queryClient.invalidateQueries({ queryKey: ["vat-tax-certificates"] }),
      queryClient.invalidateQueries({ queryKey: ["cms-works"] }),
      queryClient.invalidateQueries({ queryKey: ["documents"] }),
    ]);
}

export function useCreateVatTaxCertificate() {
  const invalidate = useInvalidateVatTaxCertificates();
  return useMutation({
    mutationFn: (payload: CreateVatTaxCertificateInput) =>
      apiRequest<VatTaxCertificateRecord>(basePath, {
        method: "POST",
        body: payload,
      }),
    onSuccess: invalidate,
  });
}

export function useUpdateVatTaxCertificate() {
  const invalidate = useInvalidateVatTaxCertificates();
  return useMutation({
    mutationFn: ({ id, payload }: { id: string; payload: UpdateVatTaxCertificateInput }) =>
      apiRequest<VatTaxCertificateRecord>(basePath + "/" + id, {
        method: "PATCH",
        body: payload,
      }),
    onSuccess: invalidate,
  });
}
