import { PolarAngleAxis, RadialBar, RadialBarChart } from "recharts";

export interface CircularProgressProps {
  percentage: number;
  color?: string;
  trackColor?: string;
  size?: number;
  label: string;
  sublabel?: string;
}

export function CircularProgress({
  percentage,
  color = "#0B5CFF",
  trackColor = "#E5EAF2",
  size = 160,
  label,
  sublabel,
}: CircularProgressProps) {
  const data = [{ value: percentage }];

  return (
    <div className="relative" style={{ width: size, height: size }}>
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
        <RadialBar dataKey="value" cornerRadius={10} fill={color} background={{ fill: trackColor }} />
      </RadialBarChart>
      <div className="absolute inset-0 flex flex-col items-center justify-center px-3 text-center">
        <span className="text-[18px] font-bold leading-tight text-biz-text">{label}</span>
        {sublabel && <span className="mt-0.5 text-[10px] leading-tight text-biz-muted">{sublabel}</span>}
      </div>
    </div>
  );
}
