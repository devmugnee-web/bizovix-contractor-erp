import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type { CreateTenderTaxInput, TenderTaxDetail, TenderTaxEntry, TenderTaxList, TenderTaxQuery, UpdateTenderTaxInput } from "@bizovix/types";
import { apiRequest, apiRequestBlob } from "../http-client";
const base = "/tender-vat-tax";
export function useTenderTaxList(query: TenderTaxQuery, enabled = true) {
  return useQuery({ queryKey: ["tender-vat-tax", "list", query], queryFn: () => apiRequest<TenderTaxList>(`${base}/tenders`, { params: { ...query } }), enabled });
}
export function useTenderTaxDetail(id: string | undefined, query: TenderTaxQuery) {
  return useQuery({ queryKey: ["tender-vat-tax", "detail", id, query], queryFn: () => apiRequest<TenderTaxDetail>(`${base}/tenders/${encodeURIComponent(id!)}`, { params: { ...query } }), enabled: !!id });
}
export function useTenderTaxMutations() {
  const client = useQueryClient();
  const onSuccess = () => client.invalidateQueries({ queryKey: ["tender-vat-tax"] });
  const create = useMutation({ mutationFn: ({ tenderId, input }: { tenderId: string; input: CreateTenderTaxInput }) => apiRequest<TenderTaxEntry>(`${base}/tenders/${encodeURIComponent(tenderId)}/entries`, { method: "POST", body: input }), onSuccess });
  const update = useMutation({ mutationFn: ({ id, input }: { id: string; input: UpdateTenderTaxInput }) => apiRequest<TenderTaxEntry>(`${base}/entries/${encodeURIComponent(id)}`, { method: "PATCH", body: input }), onSuccess });
  const voidEntry = useMutation({ mutationFn: ({ id, version, reason }: { id: string; version: number; reason: string }) => apiRequest<TenderTaxEntry>(`${base}/entries/${encodeURIComponent(id)}/void`, { method: "POST", body: { version, reason } }), onSuccess });
  const upload = useMutation({ mutationFn: ({ id, file }: { id: string; file: File }) => { const form = new FormData(); form.append("file", file); return apiRequest(`${base}/entries/${encodeURIComponent(id)}/documents`, { method: "POST", body: form }); }, onSuccess });
  return { create, update, voidEntry, upload };
}
export function downloadTenderTax(format: "pdf" | "xlsx", query: TenderTaxQuery, tenderId?: string) {
  return apiRequestBlob(`${base}${tenderId ? `/tenders/${encodeURIComponent(tenderId)}` : ""}/export/${format}`, { params: { ...query, page: undefined, limit: undefined } });
}
