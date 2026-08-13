import { CircularProgress, SectionCard, cn } from "@bizovix/ui";
import type { TenderPerformance } from "@bizovix/types";

function Tile({ label, value, colorClassName }: { label: string; value: string | number; colorClassName: string }) {
  return (
    <div>
      <p className="text-[12px] text-biz-muted">{label}</p>
      <p className={cn("text-[18px] font-bold", colorClassName)}>{value}</p>
    </div>
  );
}

export function TenderPerformanceCard({ data }: { data: TenderPerformance }) {
  return (
    <SectionCard
      title="Tender Performance (This Year)"
      index={2}
      headerRight={<span className="text-[12px] text-biz-muted">This Year</span>}
      footer={{ label: "View details" }}
    >
      <div className="flex items-center justify-between gap-4">
        <div className="grid flex-1 grid-cols-2 gap-4">
          <Tile label="Submitted" value={data.submitted} colorClassName="text-biz-blue" />
          <Tile label="NOA / Awarded" value={data.noaAwarded} colorClassName="text-biz-success" />
          <Tile label="Success Rate" value={`${data.successRate}%`} colorClassName="text-biz-purple" />
          <Tile label="Under Process" value={data.underProcess} colorClassName="text-biz-orange" />
        </div>
        <CircularProgress
          percentage={data.successRate}
          color="#16A34A"
          label={`${data.successRate}%`}
          sublabel="Success Rate"
          size={140}
        />
      </div>
    </SectionCard>
  );
}
