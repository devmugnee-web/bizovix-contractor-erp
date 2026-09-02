import {
  ArrowDownCircle,
  ArrowUpCircle,
  Banknote,
  CircleDollarSign,
  Coins,
  Landmark,
  Wallet,
} from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { useTransientScrollbar } from "@/hooks/use-transient-scrollbar";
import { formatCurrency } from "@/lib/format";
import type { PendingApprovalItem, QuickShortcutItem, SummaryMetric } from "@/types/domain";

const icons = {
  sales: CircleDollarSign,
  purchase: ArrowDownCircle,
  receipt: ArrowUpCircle,
  payment: Coins,
  cash: Wallet,
  bank: Landmark,
};

export function RightRail({
  shortcuts,
  summary,
  approvals,
}: {
  shortcuts: QuickShortcutItem[];
  summary: SummaryMetric[];
  approvals: PendingApprovalItem[];
}) {
  const shortcutsScrollRef = useTransientScrollbar<HTMLDivElement>();
  const summaryScrollRef = useTransientScrollbar<HTMLDivElement>();
  const approvalsScrollRef = useTransientScrollbar<HTMLDivElement>();

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader>
          <CardTitle>Quick Shortcuts</CardTitle>
          <Badge tone="green">Ctrl + /</Badge>
        </CardHeader>
        <CardContent ref={shortcutsScrollRef} className="transient-scrollbar max-h-[240px] space-y-3 overflow-y-auto pr-2 sm:space-y-3">
          {shortcuts.map((item) => (
            <div key={item.combo} className="grid grid-cols-[auto_minmax(0,1fr)] items-center gap-3 text-xs sm:text-sm">
              <span
                className={
                  item.combo === "Alt + D"
                    ? "rounded-lg border border-[#93c5fd] bg-[#2563eb] px-2 py-1 font-bold text-white shadow-sm"
                    : "rounded-lg border border-border px-2 py-1 font-semibold text-primary"
                }
              >
                {item.combo}
              </span>
              <span className="truncate text-right text-foreground">{item.description}</span>
            </div>
          ))}
        </CardContent>
      </Card>
      <Card>
        <CardHeader>
          <CardTitle>Today&apos;s Summary</CardTitle>
        </CardHeader>
        <CardContent ref={summaryScrollRef} className="transient-scrollbar max-h-[300px] space-y-3 overflow-y-auto pr-2">
          {summary.map((item) => {
            const Icon = icons[item.icon];
            return (
              <div key={item.label} className="grid grid-cols-[auto_minmax(0,1fr)_auto] items-center gap-3">
                <div className="rounded-lg bg-canvas p-2 text-primary">
                  <Icon className="h-4 w-4" />
                </div>
                <div className="min-w-0 truncate text-xs text-foreground sm:text-sm">{item.label}</div>
                <div className="tabular-nums text-right text-[11px] font-semibold sm:text-sm">{formatCurrency(item.value)}</div>
              </div>
            );
          })}
        </CardContent>
      </Card>
      <Card>
        <CardHeader>
          <CardTitle>Pending Approvals</CardTitle>
          <Badge tone="red">{approvals.reduce((count, item) => count + item.count, 0)}</Badge>
        </CardHeader>
        <CardContent ref={approvalsScrollRef} className="transient-scrollbar max-h-[320px] space-y-3 overflow-y-auto pr-2">
          {approvals.map((item) => (
            <div key={item.id} className="grid grid-cols-[auto_minmax(0,1fr)_auto] items-center gap-3 text-xs sm:text-sm">
              <div className="rounded-lg bg-canvas p-2 text-info">
                <Banknote className="h-4 w-4" />
              </div>
              <div className="min-w-0">
                <div className="truncate font-medium text-foreground">{item.label}</div>
                <div className="text-xs text-muted">{item.count} waiting</div>
              </div>
              <div className="tabular-nums text-right text-[11px] font-semibold sm:text-sm">{formatCurrency(item.amount)}</div>
            </div>
          ))}
        </CardContent>
      </Card>
    </div>
  );
}
