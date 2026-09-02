import { Wifi } from "lucide-react";

import type { DataMode, Workspace } from "@/types/domain";

export function StatusBar({ mode, workspace }: { mode: DataMode; workspace: Workspace }) {
  return (
    <div className="sticky bottom-0 z-20 border-t border-border bg-white/95 px-4 py-4 backdrop-blur">
      <div className="grid gap-3 text-sm text-muted md:grid-cols-4">
        <div>
          <div className="font-semibold text-primary">FY 2024-25</div>
          <div>{workspace.financialYear}</div>
        </div>
        <div>
          <div className="font-semibold text-foreground">Financial Year</div>
          <div>{workspace.financialYear}</div>
        </div>
        <div>
          <div className="font-semibold text-foreground">Open Period</div>
          <div>{workspace.openPeriod}</div>
        </div>
        <div className="flex items-center justify-between gap-4">
          <div>
            <div className="font-semibold text-foreground">Workspace</div>
            <div>
              {workspace.name}
              {mode === "demo" ? " · Demo" : ""}
            </div>
          </div>
          <div className="flex items-center gap-2 text-primary">
            <Wifi className="h-4 w-4" />
            Online
          </div>
        </div>
      </div>
    </div>
  );
}
