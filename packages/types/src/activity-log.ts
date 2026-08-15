export interface ActivityLogUser { id:string; name:string; email:string; role:string; }
export interface ActivityLogRecord { id:string; module:string; action:string; description:string; referenceNo:string|null; status:string; entityType:string; entityId:string|null; ipAddress:string|null; userAgent:string|null; oldValue:unknown; newValue:unknown; createdAt:string; user:ActivityLogUser|null; }
export interface ActivityLogQuery { page?:number;limit?:number;search?:string;userId?:string;module?:string;action?:string;status?:string;dateFrom?:string;dateTo?:string; }
export interface ActivityLogStats { total:number;today:number;userActions:number;securityAlerts:number; }
export interface ActivityLogUserOption { id:string;name:string; }
export interface ActivityLogExport { filename:string;content:string; }
