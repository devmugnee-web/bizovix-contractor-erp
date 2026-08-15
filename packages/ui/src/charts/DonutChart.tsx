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
  const valueParts = centerValue?.match(/^(.+)\s+(\S+)$/);

  return (
    <div className="relative" style={{ width: size, height: size }}>
      <PieChart width={size} height={size}>
        <Pie
          data={data}
          dataKey="value"
          nameKey="label"
          innerRadius="72%"
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
        <div className="absolute inset-0 flex flex-col items-center justify-center px-5 text-center">
          {centerLabel && <span className="text-[8px] leading-tight text-biz-muted">{centerLabel}</span>}
          {centerValue && (
            <span className="mt-0.5 flex max-w-[66px] flex-col items-center text-[10px] font-bold leading-tight text-biz-text">
              {valueParts ? (
                <>
                  <span className="whitespace-nowrap">{valueParts[1]}</span>
                  <span>{valueParts[2]}</span>
                </>
              ) : (
                centerValue
              )}
            </span>
          )}
        </div>
      )}
    </div>
  );
}
