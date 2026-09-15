import type { ReactNode } from "react";
import { CircularProgress, SectionCard, cn } from "@bizovix/ui";
import type { TenderPerformance } from "@bizovix/types";

function Tile({
  label,
  value,
  colorClassName,
}: {
  label: string;
  value: string | number;
  colorClassName: string;
}) {
  return (
    <div className="flex min-h-[54px] min-w-0 flex-col items-center justify-center rounded-md bg-slate-50 px-1 py-1.5 text-center ring-1 ring-inset ring-slate-100 xl:min-h-[58px] xl:px-2 xl:py-2 2xl:min-h-[64px] 2xl:px-3 2xl:py-2.5">
      <p
        title={label}
        className="w-full whitespace-nowrap text-center text-[7.5px] font-semibold uppercase leading-none tracking-[-0.025em] text-biz-muted sm:text-[8px] lg:text-[8.5px] xl:text-[9px] 2xl:text-[10.5px]"
      >
        {label}
      </p>
      <p
        className={cn(
          "mt-1 w-full truncate whitespace-nowrap text-center text-[10px] font-bold leading-none sm:text-[11px] lg:text-[12px] xl:text-[14px] 2xl:text-[16px]",
          colorClassName,
        )}
      >
        {value}
      </p>
    </div>
  );
}

export function TenderPerformanceCard({
  data,
  periodControl,
  customDateRange,
}: {
  data: TenderPerformance;
  periodControl: ReactNode;
  customDateRange?: ReactNode;
}) {
  return (
    <SectionCard
      title="Tender Performance"
      index={2}
      headerRight={periodControl}
      className="min-h-[220px] xl:min-h-0"
      bodyClassName="p-1.5 sm:p-2 2xl:p-3"
    >
      <div className="flex h-full min-h-0 flex-col gap-1 2xl:gap-2">
        {customDateRange}
        <div className="grid min-h-0 flex-1 grid-cols-[minmax(0,1fr)_auto] items-center gap-2 2xl:gap-3">
          <div className="grid min-w-0 grid-cols-2 gap-1.5 2xl:gap-2">
            <Tile label="Submitted" value={data.submitted} colorClassName="text-biz-blue" />
            <Tile label="NOA / Awarded" value={data.noaAwarded} colorClassName="text-biz-success" />
            <Tile
              label="Success Rate"
              value={`${data.successRate}%`}
              colorClassName="text-biz-purple"
            />
            <Tile
              label="Under Process"
              value={data.underProcess}
              colorClassName="text-biz-orange"
            />
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
      </div>
    </SectionCard>
  );
}
