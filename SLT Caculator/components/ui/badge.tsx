import * as React from "react"
import { cva, type VariantProps } from "class-variance-authority"

import { cn } from "@/lib/utils"

const badgeVariants = cva(
  "inline-flex items-center rounded-full border px-2.5 py-1 text-xs font-semibold transition-colors",
  {
    variants: {
      variant: {
        default: "border-transparent bg-[var(--color-primary)] text-white",
        secondary: "border-transparent bg-[var(--color-secondary)] text-[var(--color-secondary-foreground)]",
        outline: "text-[var(--color-foreground)]",
        success: "border-[#bbf7d0] bg-[#effdf3] text-[#15803d]",
        danger: "border-[#fecaca] bg-[#fef2f2] text-[#dc2626]",
        amber: "border-[#fde68a] bg-[#fff8e6] text-[#b45309]"
      }
    },
    defaultVariants: {
      variant: "default"
    }
  }
)

function Badge({ className, variant, ...props }: React.ComponentProps<"div"> & VariantProps<typeof badgeVariants>) {
  return <div className={cn(badgeVariants({ variant }), className)} {...props} />
}

export { Badge, badgeVariants }
