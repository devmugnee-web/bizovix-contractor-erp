import { CircularProgress, SectionCard, cn } from "@bizovix/ui";
import type { TenderPerformance } from "@bizovix/types";

function Tile({ label, value, colorClassName }: { label: string; value: string | number; colorClassName: string }) {
  return (
    <div>
      <p className="text-[11px] font-medium text-biz-muted">{label}</p>
      <p className={cn("text-[15px] font-bold leading-tight", colorClassName)}>{value}</p>
    </div>
  );
}

export function TenderPerformanceCard({ data }: { data: TenderPerformance }) {
  return (
    <SectionCard
      title="Tender Performance (This Year)"
      index={2}
      headerRight={<span className="text-[11px] text-biz-muted">This Year</span>}
      footer={{ label: "View details" }}
      bodyClassName="p-3"
    >
      <div className="grid items-center gap-2 xl:grid-cols-[1fr_auto]">
        <div className="grid min-w-0 grid-cols-2 gap-x-3 gap-y-2">
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
          />
        </div>
      </div>
    </SectionCard>
  );
}
