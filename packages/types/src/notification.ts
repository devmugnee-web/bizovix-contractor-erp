export type NotificationStage = "UPCOMING" | "URGENT" | "DUE_TODAY" | "OVERDUE";
export interface NotificationRecord {
  id: string;
  type: NotificationStage | string;
  title: string;
  message: string;
  reminderId?: string | null;
  sourceModule?: string | null;
  sourceType?: string | null;
  sourceId?: string | null;
  priority: string;
  isRead: boolean;
  readAt?: string | null;
  createdAt: string;
}
export interface NotificationQuery {
  page?: number;
  limit?: number;
  isRead?: boolean;
}
export interface NotificationList {
  items: NotificationRecord[];
  meta: { page: number; limit: number; total: number; totalPages: number };
}
