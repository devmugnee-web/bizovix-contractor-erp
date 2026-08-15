import { useMutation,useQuery,useQueryClient } from "@tanstack/react-query";
import type { AccountingQuery,AccountingSummary,JournalLineRecord,JournalRecord,LedgerAccountRecord,PayableRecord,ProjectAccountRecord,ReceivableRecord,SaveJournalInput } from "@bizovix/types";
import { apiRequest,apiRequestPaginated,apiRequestPaginatedWithSummary } from "../http-client";
const key=["accounts"] as const;const params=(q:AccountingQuery)=>Object.fromEntries(Object.entries(q).filter(([,v])=>v!==""&&v!=null)) as Record<string,string|number|undefined>;
export const useAccountingSummary=()=>useQuery({queryKey:[...key,"summary"],queryFn:()=>apiRequest<AccountingSummary>("/accounts/summary")});
export const useChartOfAccounts=()=>useQuery({queryKey:[...key,"chart"],queryFn:()=>apiRequest<LedgerAccountRecord[]>("/accounts/chart")});
export const useJournals=(q:AccountingQuery)=>useQuery({queryKey:[...key,"journals",q],queryFn:()=>apiRequestPaginated<JournalRecord>("/accounts/journals",{params:params(q)}),placeholderData:p=>p});
export const useGeneralLedger=(q:AccountingQuery)=>useQuery({queryKey:[...key,"ledger",q],queryFn:()=>apiRequestPaginatedWithSummary<JournalLineRecord,Record<string,string|number>>("/accounts/ledger",{params:params(q)}),placeholderData:p=>p});
export const useReceivables=(q:AccountingQuery)=>useQuery({queryKey:[...key,"receivables",q],queryFn:()=>apiRequestPaginatedWithSummary<ReceivableRecord,Record<string,string|number>>("/accounts/receivables",{params:params(q)}),placeholderData:p=>p});
export const usePayables=(q:AccountingQuery)=>useQuery({queryKey:[...key,"payables",q],queryFn:()=>apiRequestPaginatedWithSummary<PayableRecord,Record<string,string|number>>("/accounts/payables",{params:params(q)}),placeholderData:p=>p});
export const useProjectAccounts=(q:AccountingQuery)=>useQuery({queryKey:[...key,"projects",q],queryFn:()=>apiRequest<ProjectAccountRecord[]>("/accounts/projects",{params:params(q)})});
export const usePartyLedger=(q:AccountingQuery)=>useQuery({queryKey:[...key,"party",q],queryFn:()=>apiRequestPaginatedWithSummary<JournalLineRecord,Record<string,string|number>>("/accounts/party-ledger",{params:params(q)})});
export const useOpeningBalances=(q:AccountingQuery)=>useQuery({queryKey:[...key,"openings",q],queryFn:()=>apiRequestPaginated<JournalRecord>("/accounts/opening-balances",{params:params(q)})});
function mutation<T extends Record<string,unknown>>(path:string,method:"POST"|"PATCH"="POST"){return()=>{const qc=useQueryClient();return useMutation<unknown,Error,T>({mutationFn:body=>apiRequest(path,{method,body}),onSuccess:()=>qc.invalidateQueries({queryKey:key})})}}
export const useCreateLedgerAccount=mutation<Record<string,unknown>>("/accounts/chart");
export const useCreateJournal=mutation<SaveJournalInput & Record<string,unknown>>("/accounts/journals");
export function useJournalAction(id:string,action:"post"|"reverse"){const qc=useQueryClient();return useMutation({mutationFn:()=>apiRequest(`/accounts/journals/${id}/${action}`,{method:"POST"}),onSuccess:()=>qc.invalidateQueries({queryKey:key})})}
export const useCreatePayable=mutation<Record<string,unknown>>("/accounts/payables");
export function usePayPayable(id:string){const qc=useQueryClient();return useMutation({mutationFn:(body:Record<string,unknown>)=>apiRequest(`/accounts/payables/${id}/pay`,{method:"POST",body}),onSuccess:()=>qc.invalidateQueries({queryKey:key})})}
export const useCreateOpeningBalance=mutation<Record<string,unknown>>("/accounts/opening-balances");
