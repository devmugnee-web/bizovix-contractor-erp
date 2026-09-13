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
  responsive?: boolean;
}

export function DonutChart({
  data,
  size = 160,
  centerLabel,
  centerValue,
  responsive = false,
}: DonutChartProps) {
  const valueParts = centerValue?.match(/^(.+)\s+(\S+)$/);

  return (
    <div
      className={
        responsive ? "h-[76px] w-[76px] xl:h-[108px] xl:w-[108px] 2xl:h-[126px] 2xl:w-[126px]" : ""
      }
      style={responsive ? undefined : { width: size, height: size }}
    >
      <div
        className={`relative origin-top-left ${responsive ? "scale-[0.7037] xl:scale-100 2xl:scale-[1.1667]" : ""}`}
        style={{ width: size, height: size }}
      >
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
            {centerLabel && (
              <span className="text-[9px] font-medium leading-tight text-slate-600 2xl:text-[10px]">
                {centerLabel}
              </span>
            )}
            {centerValue && (
              <span className="mt-0.5 flex max-w-[72px] flex-col items-center text-[11px] font-bold leading-tight text-biz-text 2xl:text-[13px]">
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
    </div>
  );
}
