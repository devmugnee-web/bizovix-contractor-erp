import { CircularProgress, SectionCard, cn } from "@bizovix/ui";
import type { TenderPerformance } from "@bizovix/types";

function Tile({ label, value, colorClassName }: { label: string; value: string | number; colorClassName: string }) {
  return (
    <div className="rounded-md bg-slate-50 px-1.5 py-1.5 ring-1 ring-inset ring-slate-100 sm:px-2 xl:px-3 xl:py-3">
      <p className="text-[6px] font-semibold uppercase tracking-[0.04em] text-biz-muted sm:text-[8px] lg:text-[9px] xl:text-[10px]">{label}</p>
      <p className={cn("text-[8px] font-bold leading-tight sm:text-[10px] lg:text-[12px] xl:text-[14px]", colorClassName)}>{value}</p>
    </div>
  );
}

export function TenderPerformanceCard({ data }: { data: TenderPerformance }) {
  return (
    <SectionCard
      title="Tender Performance (This Year)"
      index={2}
      headerRight={<span className="text-[6px] text-biz-muted sm:text-[8px] lg:text-[10px]">This Year</span>}
      bodyClassName="p-1.5 sm:p-2"
    >
      <div className="grid h-full min-h-0 grid-cols-[minmax(0,1fr)_auto] items-center gap-1 sm:gap-2">
        <div className="grid min-w-0 grid-cols-2 gap-1">
          <Tile label="Submitted" value={data.submitted} colorClassName="text-biz-blue" />
          <Tile label="NOA / Awarded" value={data.noaAwarded} colorClassName="text-biz-success" />
          <Tile label="Success Rate" value={`${data.successRate}%`} colorClassName="text-biz-purple" />
          <Tile label="Under Process" value={data.underProcess} colorClassName="text-biz-orange" />
        </div>
        <div className="justify-self-center">
          <CircularProgress
            percentage={data.successRate}
            color="#16A34A"
            label={`${data.successRate}%`}
            sublabel="Success Rate"
            size={104}
            responsive
          />
        </div>
      </div>
    </SectionCard>
  );
}
