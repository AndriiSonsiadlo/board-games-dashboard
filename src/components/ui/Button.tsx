import { LoaderCircle } from "lucide-react";
import { cn } from "@/lib/cn";

const variants = {
  primary: "bg-accent text-bg hover:brightness-110 active:brightness-95",
  secondary: "border border-line-strong bg-surface-2 text-text hover:border-text/40",
  ghost: "text-muted hover:text-text hover:bg-white/5",
  danger: "border border-down/50 text-down hover:bg-down/10",
};

const sizes = {
  sm: "h-8 px-3 text-xs",
  md: "h-11 px-4 text-sm",
  lg: "h-14 px-6 text-base",
};

export interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: keyof typeof variants;
  size?: keyof typeof sizes;
  loading?: boolean;
  block?: boolean;
}

export function Button({
  variant = "secondary",
  size = "md",
  loading = false,
  block = false,
  className,
  children,
  disabled,
  type = "button",
  ...props
}: ButtonProps) {
  return (
    <button
      type={type}
      disabled={disabled || loading}
      className={cn(
        "inline-flex select-none items-center justify-center gap-2 rounded-md font-display uppercase tracking-[0.08em] transition-[filter,background-color,border-color,color] duration-200 disabled:pointer-events-none disabled:opacity-40",
        variants[variant],
        sizes[size],
        block && "w-full",
        className,
      )}
      {...props}
    >
      {loading ? <LoaderCircle className="size-4 animate-spin" aria-hidden /> : null}
      {children}
    </button>
  );
}
