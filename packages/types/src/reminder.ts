export type ReminderPriority = "LOW" | "MEDIUM" | "HIGH" | "CRITICAL";
export type ReminderStatus =
  "UPCOMING" | "DUE_TODAY" | "OVERDUE" | "SNOOZED" | "COMPLETED" | "CANCELLED";
export interface ReminderRecord {
  id: string;
  type: string;
  title: string;
  description?: string | null;
  priority: ReminderPriority;
  status: ReminderStatus;
  dueDate: string;
  dueTime?: string | null;
  assignedToUserId?: string | null;
  assignedToName?: string | null;
  sourceModule: string;
  sourceType?: string | null;
  sourceId?: string | null;
  relatedEntityType?: string | null;
  relatedEntityId?: string | null;
  relatedEntityName?: string | null;
  referenceNo?: string | null;
  organizationMasterId?: string | null;
  organizationName?: string | null;
  notificationBefore: number;
  repeatType: string;
  remarks?: string | null;
  snoozedUntil?: string | null;
  createdByName?: string | null;
  completedByName?: string | null;
  completedAt?: string | null;
  cancelledAt?: string | null;
  createdAt: string;
  updatedAt: string;
}
export interface ReminderQuery {
  page?: number;
  limit?: number;
  search?: string;
  dateFrom?: string;
  dateTo?: string;
  type?: string;
  status?: string;
  priority?: string;
  assignedToUserId?: string;
  sourceModule?: string;
}
export interface ReminderList {
  items: ReminderRecord[];
  meta: { page: number; limit: number; total: number; totalPages: number };
}
export interface ReminderStats {
  dueToday: number;
  upcoming: number;
  overdue: number;
  completed: number;
  upcoming7Days: number;
  critical: number;
}
export interface ReminderRelatedRecordOption {
  id: string;
  label: string;
  sourceType: string;
  referenceNo?: string | null;
  organizationMasterId?: string | null;
  organizationName?: string | null;
}
export interface SaveReminderInput {
  title: string;
  type: string;
  description?: string;
  dueDate: string;
  dueTime?: string;
  priority: ReminderPriority;
  assignedToUserId?: string;
  assignedToName: string;
  sourceModule?: string;
  sourceType?: string;
  sourceId?: string;
  relatedEntityType?: string;
  relatedEntityId?: string;
  relatedEntityName?: string;
  referenceNo?: string;
  organizationMasterId?: string;
  organizationName?: string;
  notificationBefore?: number;
  repeatType?: string;
  remarks?: string;
}
