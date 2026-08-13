import { Cell, Pie, PieChart } from "recharts";

export interface DonutChartDatum {
  label: string;
  value: number;
  color: string;
}

export interface DonutChartProps {
  data: DonutChartDatum[];
  size?: number;
  centerLabel?: string;
  centerValue?: string;
}

export function DonutChart({ data, size = 160, centerLabel, centerValue }: DonutChartProps) {
  return (
    <div className="relative" style={{ width: size, height: size }}>
      <PieChart width={size} height={size}>
        <Pie
          data={data}
          dataKey="value"
          nameKey="label"
          innerRadius="62%"
          outerRadius="100%"
          paddingAngle={2}
          cx="50%"
          cy="50%"
          stroke="none"
        >
          {data.map((entry) => (
            <Cell key={entry.label} fill={entry.color} />
          ))}
        </Pie>
      </PieChart>
      {(centerLabel || centerValue) && (
        <div className="absolute inset-0 flex flex-col items-center justify-center">
          {centerLabel && <span className="text-[11px] text-biz-muted">{centerLabel}</span>}
          {centerValue && <span className="text-[16px] font-bold text-biz-text">{centerValue}</span>}
        </div>
      )}
    </div>
  );
}
