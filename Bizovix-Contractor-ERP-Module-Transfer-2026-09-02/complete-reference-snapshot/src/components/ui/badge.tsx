import type { HTMLAttributes } from "react";

import { cn } from "@/lib/utils";

const palette = {
  green: "bg-[#e8f7ef] text-black",
  blue: "bg-[#ebf2ff] text-black",
  amber: "bg-[#fff5dd] text-black",
  red: "bg-[#fdecec] text-black",
  slate: "bg-[#edf1f6] text-black",
};

export function Badge({
  className,
  tone = "slate",
  ...props
}: HTMLAttributes<HTMLSpanElement> & { tone?: keyof typeof palette }) {
  return (
    <span
      className={cn("inline-flex rounded-lg px-2.5 py-1 text-xs font-semibold", palette[tone], className)}
      {...props}
    />
  );
}
