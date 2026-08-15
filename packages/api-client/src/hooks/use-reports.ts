import { useMutation,useQuery } from "@tanstack/react-query";
import type { ReportCenterSummary,ReportExport,ReportOptions,ReportQuery,ReportResult } from "@bizovix/types";
import { apiRequest } from "../http-client";
const params=(q:ReportQuery)=>Object.fromEntries(Object.entries(q).filter(([,v])=>v!==""&&v!=null)) as Record<string,string|number|undefined>;
export const useReportSummary=()=>useQuery({queryKey:["reports","summary"],queryFn:()=>apiRequest<ReportCenterSummary>("/reports/summary")});
export const useReportOptions=()=>useQuery({queryKey:["reports","options"],queryFn:()=>apiRequest<ReportOptions>("/reports/options")});
export const useReport=(category:string,report:string,q:ReportQuery)=>useQuery({queryKey:["reports",category,report,q],queryFn:()=>apiRequest<ReportResult>(`/reports/${category}/${report}`,{params:params(q)}),placeholderData:p=>p});
export const useExportReport=(category:string,report:string)=>useMutation({mutationFn:(q:ReportQuery)=>apiRequest<ReportExport>(`/reports/${category}/${report}/export`,{params:params(q)})});
