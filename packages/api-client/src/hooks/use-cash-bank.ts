import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type { BankReconciliationRecord, CashBankQuery, CashBankSummary, ChequeRecord, FinancialAccount, FundTransferRecord, PaginatedFinancialTransactions } from "@bizovix/types";
import { apiRequest, apiRequestPaginated } from "../http-client";

const key = ["cash-bank"] as const;
const params = (q:CashBankQuery={}) => { const p=new URLSearchParams(); Object.entries(q).forEach(([k,v])=>v!=null&&v!==""&&p.set(k,String(v))); const s=p.toString(); return s?`?${s}`:""; };
export const useCashBankSummary=()=>useQuery({queryKey:[...key,"summary"],queryFn:()=>apiRequest<CashBankSummary>("/cash-bank/summary")});
export const useFinancialAccounts=()=>useQuery({queryKey:[...key,"accounts"],queryFn:()=>apiRequest<FinancialAccount[]>("/cash-bank/accounts")});
export const useCashLedger=(kind:"main-cash"|"petty-cash"|"transactions",q:CashBankQuery={})=>useQuery({queryKey:[...key,kind,q],queryFn:()=>apiRequestPaginated<PaginatedFinancialTransactions["items"][number]>(`/cash-bank/${kind}${params(q)}`)});
export const useFundTransfers=(q:CashBankQuery={})=>useQuery({queryKey:[...key,"transfers",q],queryFn:()=>apiRequestPaginated<FundTransferRecord>(`/cash-bank/transfers${params(q)}`)});
export const useReconciliations=()=>useQuery({queryKey:[...key,"reconciliations"],queryFn:()=>apiRequest<BankReconciliationRecord[]>("/cash-bank/reconciliations")});
export const useCheques=()=>useQuery({queryKey:[...key,"cheques"],queryFn:()=>apiRequest<ChequeRecord[]>("/cash-bank/cheques")});
function mutation(path:string,method:"POST"|"PATCH"="POST"){return ()=>{const qc=useQueryClient();return useMutation<unknown,Error,Record<string,unknown>>({mutationFn:(body)=>apiRequest(path,{method,body}),onSuccess:()=>qc.invalidateQueries({queryKey:key})});};}
export const useCreateBankAccount=mutation("/cash-bank/accounts");
export function useUpdateBankAccount(){const qc=useQueryClient();return useMutation<unknown,Error,{id:string;body:Record<string,unknown>}>({mutationFn:({id,body})=>apiRequest(`/cash-bank/accounts/${id}`,{method:"PATCH",body}),onSuccess:()=>qc.invalidateQueries({queryKey:key})});}
export function useDeleteBankAccount(){const qc=useQueryClient();return useMutation<unknown,Error,string>({mutationFn:(id)=>apiRequest(`/cash-bank/accounts/${id}`,{method:"DELETE"}),onSuccess:()=>qc.invalidateQueries({queryKey:key})});}
export const useCreateMainCash=mutation("/cash-bank/main-cash");
export const useCreatePettyExpense=mutation("/cash-bank/petty-cash/expenses");
export const useReplenishPettyCash=mutation("/cash-bank/petty-cash/replenishments");
export const useCreateFundTransfer=mutation("/cash-bank/transfers");
export const useCreateReconciliation=mutation("/cash-bank/reconciliations");
export const useCreateCheque=mutation("/cash-bank/cheques");
export function useUpdateChequeStatus(id:string){const qc=useQueryClient();return useMutation<unknown,Error,Record<string,unknown>>({mutationFn:(body)=>apiRequest(`/cash-bank/cheques/${id}/status`,{method:"PATCH",body}),onSuccess:()=>qc.invalidateQueries({queryKey:key})});}
