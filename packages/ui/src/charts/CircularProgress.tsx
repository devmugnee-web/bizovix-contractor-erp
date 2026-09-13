import { PolarAngleAxis, RadialBar, RadialBarChart } from "recharts";

export interface CircularProgressProps {
  percentage: number;
  color?: string;
  trackColor?: string;
  size?: number;
  label: string;
  sublabel?: string;
  responsive?: boolean;
}

export function CircularProgress({
  percentage,
  color = "#0B5CFF",
  trackColor = "#E5EAF2",
  size = 160,
  label,
  sublabel,
  responsive = false,
}: CircularProgressProps) {
  const data = [{ value: percentage }];

  return (
    <div
      className={
        responsive ? "h-[72px] w-[72px] xl:h-[104px] xl:w-[104px] 2xl:h-[120px] 2xl:w-[120px]" : ""
      }
      style={responsive ? undefined : { width: size, height: size }}
    >
      <div
        className={`relative origin-top-left ${responsive ? "scale-[0.6923] xl:scale-100 2xl:scale-[1.1538]" : ""}`}
        style={{ width: size, height: size }}
      >
        <RadialBarChart
          width={size}
          height={size}
          cx="50%"
          cy="50%"
          innerRadius="72%"
          outerRadius="100%"
          barSize={10}
          data={data}
          startAngle={90}
          endAngle={-270}
        >
          <PolarAngleAxis type="number" domain={[0, 100]} tick={false} />
          <RadialBar
            dataKey="value"
            cornerRadius={10}
            fill={color}
            background={{ fill: trackColor }}
          />
        </RadialBarChart>
        <div className="absolute inset-0 flex flex-col items-center justify-center px-3 text-center">
          <span className="text-[11px] font-bold leading-tight text-biz-text sm:text-[12px] 2xl:text-[14px]">
            {label}
          </span>
          {sublabel && (
            <span className="mt-0.5 text-[7px] font-medium leading-tight text-slate-600 sm:text-[8px] 2xl:text-[9px]">
              {sublabel}
            </span>
          )}
        </div>
      </div>
    </div>
  );
}
