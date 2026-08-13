import * as React from "react";
import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "../lib/cn";

export const buttonVariants = cva(
  "inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-sm text-[13px] font-medium transition-colors disabled:pointer-events-none disabled:opacity-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-biz-blue/40",
  {
    variants: {
      variant: {
        primary: "bg-biz-blue text-white hover:bg-biz-blue-hover",
        accent: "bg-biz-orange text-white hover:brightness-95",
        outline: "bg-biz-surface text-biz-text border border-biz-border hover:bg-biz-bg",
        "outline-blue": "bg-biz-surface text-biz-blue border border-biz-blue hover:bg-biz-blue-soft",
        ghost: "bg-transparent text-biz-text hover:bg-biz-bg",
        danger: "bg-biz-danger text-white hover:brightness-95",
      },
      size: {
        md: "h-10 px-4",
        sm: "h-9 px-3 text-xs",
        icon: "h-9 w-9 p-0",
      },
    },
    defaultVariants: { variant: "primary", size: "md" },
  },
);

export interface ButtonProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement>,
    VariantProps<typeof buttonVariants> {}

export const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant, size, ...props }, ref) => (
    <button ref={ref} className={cn(buttonVariants({ variant, size }), className)} {...props} />
  ),
);
Button.displayName = "Button";

export const PrimaryButton = React.forwardRef<HTMLButtonElement, ButtonProps>((props, ref) => (
  <Button ref={ref} variant="primary" {...props} />
));
PrimaryButton.displayName = "PrimaryButton";

export const SecondaryButton = React.forwardRef<HTMLButtonElement, ButtonProps>((props, ref) => (
  <Button ref={ref} variant="outline" {...props} />
));
SecondaryButton.displayName = "SecondaryButton";

export const IconButton = React.forwardRef<HTMLButtonElement, ButtonProps>((props, ref) => (
  <Button ref={ref} variant="outline" size="icon" {...props} />
));
IconButton.displayName = "IconButton";
