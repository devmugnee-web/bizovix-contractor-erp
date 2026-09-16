export type SupportTicketIssueType =
  | "TECHNICAL"
  | "HOW_TO"
  | "DATA"
  | "FEATURE"
  | "ACCOUNT";

export type SupportTicketPriority = "NORMAL" | "HIGH" | "URGENT";

export type SupportTicketStatus =
  | "OPEN"
  | "IN_PROGRESS"
  | "WAITING_FOR_CUSTOMER"
  | "RESOLVED"
  | "CLOSED";

export interface SupportTicketAttachment {
  id: string;
  fileName: string;
  mimeType: string;
  fileSize: number;
  createdAt: string;
}

export interface SupportTicketMessage {
  id: string;
  authorType: "CUSTOMER" | "SUPPORT";
  authorName: string;
  body: string;
  createdAt: string;
  attachments: SupportTicketAttachment[];
}

export interface SupportTicketSummary {
  id: string;
  number: number;
  subject: string;
  issueType: SupportTicketIssueType;
  moduleName: string;
  priority: SupportTicketPriority;
  status: SupportTicketStatus;
  organizationName: string;
  createdByName: string;
  createdAt: string;
  lastActivityAt: string;
  lastMessagePreview: string;
  messageCount: number;
}

export interface SupportTicketDetail extends SupportTicketSummary {
  pagePath: string | null;
  appVersion: string | null;
  messages: SupportTicketMessage[];
}

export interface SupportTicketQuery {
  page?: number;
  limit?: number;
  status?: SupportTicketStatus;
  search?: string;
}
