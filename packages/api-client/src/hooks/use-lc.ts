import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type { LcCostHeadRecord, LcDashboard, LcDetail, LcListRecord, SaveLcInput, WarehouseRecord } from "@bizovix/types";
import { apiRequest } from "../http-client";

const key = ["lc"] as const;
const useInvalidate = () => { const client = useQueryClient(); return () => client.invalidateQueries({ queryKey: key }); };
export const useLcs = () => useQuery({ queryKey: [...key, "list"], queryFn: () => apiRequest<LcListRecord[]>("/lc") });
export const useLc = (id?: string) => useQuery({ queryKey: [...key, id], queryFn: () => apiRequest<LcDetail>(`/lc/${id}`), enabled: Boolean(id) });
export const useLcDashboard = () => useQuery({ queryKey: [...key, "dashboard"], queryFn: () => apiRequest<LcDashboard>("/lc/dashboard") });
export const useLcCostHeads = () => useQuery({ queryKey: [...key, "cost-heads"], queryFn: () => apiRequest<LcCostHeadRecord[]>("/lc/cost-heads") });
export const useWarehouses = () => useQuery({ queryKey: [...key, "warehouses"], queryFn: () => apiRequest<WarehouseRecord[]>("/lc/warehouses") });
export function useCreateLc() { const done = useInvalidate(); return useMutation({ mutationFn: (body: SaveLcInput) => apiRequest<LcDetail>("/lc", { method: "POST", body }), onSuccess: done }); }
export function useCreateWarehouse() { const done = useInvalidate(); return useMutation({ mutationFn: (body: { code: string; name: string; address?: string }) => apiRequest<WarehouseRecord>("/lc/warehouses", { method: "POST", body }), onSuccess: done }); }
export function useCreateLcCostHead() { const done = useInvalidate(); return useMutation({ mutationFn: (body: Record<string, unknown>) => apiRequest<LcCostHeadRecord>("/lc/cost-heads", { method: "POST", body }), onSuccess: done }); }
export function useLcAction<T = LcDetail>(path: string, method: "POST" | "PATCH" | "DELETE" = "POST") { const done = useInvalidate(); return useMutation<T, Error, unknown>({ mutationFn: (body) => apiRequest<T>(`/lc/${path}`, { method, body }), onSuccess: done }); }
export function useLcCommand<T = LcDetail>() { const done = useInvalidate(); return useMutation<T, Error, { path: string; method?: "POST" | "PATCH" | "DELETE"; body?: unknown }>({ mutationFn: ({ path, method = "POST", body }) => apiRequest<T>(`/lc/${path}`, { method, body }), onSuccess: done }); }
