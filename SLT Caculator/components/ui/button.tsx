import * as React from "react"
import { cva, type VariantProps } from "class-variance-authority"

import { cn } from "@/lib/utils"

const buttonVariants = cva(
  "inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-2xl text-sm font-semibold transition-all outline-none disabled:pointer-events-none disabled:opacity-50 [&_svg]:pointer-events-none [&_svg]:size-4 focus-visible:ring-4 focus-visible:ring-[var(--color-ring)]",
  {
    variants: {
      variant: {
        default: "bg-[var(--color-primary)] text-white shadow-[var(--shadow-card)] hover:-translate-y-0.5 hover:opacity-95",
        secondary: "bg-[var(--color-secondary)] text-[var(--color-secondary-foreground)] hover:bg-[#e3ebff]",
        outline: "border border-[var(--color-border)] bg-white text-[var(--color-foreground)] hover:bg-[var(--color-muted)]",
        ghost: "text-[var(--color-muted-foreground)] hover:bg-[var(--color-muted)] hover:text-[var(--color-foreground)]",
        purple: "bg-gradient-to-r from-[#7c3aed] to-[#9333ea] text-white shadow-[var(--shadow-card)] hover:-translate-y-0.5",
        green: "bg-gradient-to-r from-[#16a34a] to-[#22c55e] text-white shadow-[var(--shadow-card)] hover:-translate-y-0.5",
        amber: "bg-gradient-to-r from-[#f59e0b] to-[#fbbf24] text-[#5c3b00] shadow-[var(--shadow-card)] hover:-translate-y-0.5",
        destructive: "bg-gradient-to-r from-[#ef4444] to-[#f87171] text-white shadow-[var(--shadow-card)] hover:-translate-y-0.5"
      },
      size: {
        default: "h-11 px-5 py-3",
        sm: "h-9 rounded-xl px-3 text-xs",
        lg: "h-12 px-6 py-3.5 text-sm",
        icon: "size-10 rounded-xl"
      }
    },
    defaultVariants: {
      variant: "default",
      size: "default"
    }
  }
)

export interface ButtonProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement>,
    VariantProps<typeof buttonVariants> {}

const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant, size, ...props }, ref) => {
    return <button className={cn(buttonVariants({ variant, size, className }))} ref={ref} {...props} />
  }
)
Button.displayName = "Button"

export { Button, buttonVariants }
