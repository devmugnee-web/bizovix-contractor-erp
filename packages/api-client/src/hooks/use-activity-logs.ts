import { useMutation,useQuery } from "@tanstack/react-query";
import type { ActivityLogExport,ActivityLogQuery,ActivityLogRecord,ActivityLogStats,ActivityLogUserOption } from "@bizovix/types";
import { apiRequest,apiRequestPaginated } from "../http-client";
import { queryKeys } from "./query-keys";
export function useActivityLogs(query:ActivityLogQuery){return useQuery({queryKey:queryKeys.activityLogs(query),queryFn:()=>apiRequestPaginated<ActivityLogRecord>("/activity-logs",{params:{...query}}),placeholderData:p=>p})}
export function useActivityLogStats(){return useQuery({queryKey:queryKeys.activityLogStats,queryFn:()=>apiRequest<ActivityLogStats>("/activity-logs/stats")})}
export function useActivityLogUsers(){return useQuery({queryKey:["activity-logs","users"],queryFn:()=>apiRequest<ActivityLogUserOption[]>("/activity-logs/users")})}
export function useActivityLog(id?:string){return useQuery({queryKey:["activity-logs",id],queryFn:()=>apiRequest<ActivityLogRecord>(`/activity-logs/${id}`),enabled:!!id})}
export function useExportActivityLogs(){return useMutation({mutationFn:(query:ActivityLogQuery)=>apiRequest<ActivityLogExport>("/activity-logs/export",{params:{...query}})})}
