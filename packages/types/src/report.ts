export interface ReportQuery{page?:number;limit?:number;dateFrom?:string;dateTo?:string;search?:string;organizationMasterId?:string;workId?:string;category?:string;status?:string;accountId?:string;tenderSecurityItemId?:string}
export interface ReportColumn{key:string;label:string;type?:"money"|"date"|string}
export interface ReportKpi{label:string;value:string;kind?:string}
export interface ReportResult{title:string;subtitle:string;kpis:ReportKpi[];columns:ReportColumn[];rows:Array<Record<string,string|number|null>>;meta:{page:number;limit:number;total:number;totalPages:number}}
export interface ReportCenterSummary{totalReports:number;thisMonthExpenses:string;thisMonthReceipts:string;outstandingReceivables:string}
export interface ReportOptions{organizations:Array<{id:string;shortName:string}>;works:Array<{id:string;workName:string}>;accounts:Array<{id:string;accountName:string}>;ledgerAccounts:Array<{id:string;accountName:string}>;categories:string[]}
export interface ReportExport{filename:string;content:string}
