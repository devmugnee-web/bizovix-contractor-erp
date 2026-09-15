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
        responsive ? "h-[76px] w-[76px] overflow-hidden rounded-full xl:h-[108px] xl:w-[108px] 2xl:h-[126px] 2xl:w-[126px]" : "overflow-hidden rounded-full"
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
          <div className="absolute inset-[16%] flex min-h-0 min-w-0 flex-col items-center justify-center overflow-hidden text-center">
            {centerLabel && (
              <span className="max-w-full break-words text-[8px] font-medium leading-[1.05] text-slate-600 [overflow-wrap:anywhere] sm:text-[8.5px] 2xl:text-[10px]">
                {centerLabel}
              </span>
            )}
            {centerValue && (
              <span className="mt-0.5 flex max-w-full flex-col items-center overflow-hidden text-[10px] font-bold leading-[1.05] text-biz-text sm:text-[11px] 2xl:text-[13px]">
                {valueParts ? (
                  <>
                    <span className="max-w-full whitespace-nowrap">{valueParts[1]}</span>
                    <span className="max-w-full whitespace-nowrap">{valueParts[2]}</span>
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
