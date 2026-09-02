import * as React from "react";
import { cva, type VariantProps } from "class-variance-authority";
import { Slot } from "@radix-ui/react-slot";

import { cn } from "@/lib/utils";

const buttonVariants = cva(
  "button-motion inline-flex items-center justify-center gap-2.5 whitespace-nowrap rounded-xl border text-sm font-medium transition-colors disabled:pointer-events-none disabled:opacity-50 [&_svg]:shrink-0",
  {
    variants: {
      variant: {
        default: "border-transparent bg-primary px-4 py-2 text-white hover:bg-[#cf670f]",
        outline:
          "border-[#d6dfeb] bg-white px-4 py-2 text-[#334155] hover:border-[#c3cfdd] hover:bg-[#f4f7fb] hover:text-[#17263c] disabled:border-[#e6ebf2] disabled:bg-[#fbfcfe] disabled:text-[#a5afbf]",
        ghost: "border-transparent bg-transparent px-3 py-2 text-muted hover:bg-canvas hover:text-foreground",
        subtle: "border-transparent bg-primary-soft px-4 py-2 text-primary hover:bg-[#ffe6cc]",
      },
      size: {
        default: "h-10",
        sm: "h-9 px-3 text-xs",
        icon: "h-10 w-10",
      },
    },
    defaultVariants: {
      variant: "default",
      size: "default",
    },
  },
);

export interface ButtonProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement>,
    VariantProps<typeof buttonVariants> {
  asChild?: boolean;
}

export const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant, size, asChild = false, ...props }, ref) => {
    const Comp = asChild ? Slot : "button";
    return <Comp className={cn(buttonVariants({ variant, size }), className)} ref={ref} {...props} />;
  },
);

Button.displayName = "Button";
