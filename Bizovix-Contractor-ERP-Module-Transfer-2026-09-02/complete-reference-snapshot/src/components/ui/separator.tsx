import * as SeparatorPrimitive from "@radix-ui/react-separator";

import { cn } from "@/lib/utils";

export function Separator({
  className,
  ...props
}: React.ComponentProps<typeof SeparatorPrimitive.Root>) {
  return (
    <SeparatorPrimitive.Root
      decorative
      className={cn("shrink-0 bg-border", props.orientation === "vertical" ? "h-full w-px" : "h-px w-full", className)}
      {...props}
    />
  );
}
