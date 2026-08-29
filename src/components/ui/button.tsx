import * as React from 'react';
import { cva, type VariantProps } from 'class-variance-authority';
import { cn } from '@/lib/utils';

const buttonVariants = cva(
  'inline-flex items-center justify-center gap-2 whitespace-nowrap font-medium transition-all duration-150 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#1b7ff0] focus-visible:ring-offset-2 focus-visible:ring-offset-[#0a0a0a] disabled:pointer-events-none disabled:opacity-40 select-none',
  {
    variants: {
      variant: {
        default:
          'bg-[#1b7ff0] text-[#f5f5f5] hover:bg-[#1570d8] active:bg-[#1262c0] shadow-sm',
        destructive:
          'bg-[#e5463e] text-[#f5f5f5] hover:bg-[#cc3e37] active:bg-[#b53530] shadow-sm',
        outline:
          'border border-[#242424] bg-transparent text-[#a0a0a0] hover:bg-[#1a1a1a] hover:text-[#f5f5f5] hover:border-[#333333]',
        ghost:
          'bg-transparent text-[#a0a0a0] hover:bg-[#1a1a1a] hover:text-[#f5f5f5]',
        secondary:
          'bg-[#1a1a1a] text-[#a0a0a0] border border-[#242424] hover:bg-[#222222] hover:text-[#f5f5f5]',
      },
      size: {
        sm: 'h-7 rounded px-3 text-xs tracking-wide',
        md: 'h-9 rounded-md px-4 text-sm',
        lg: 'h-11 rounded-md px-6 text-base',
      },
    },
    defaultVariants: {
      variant: 'default',
      size: 'md',
    },
  }
);

export interface ButtonProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement>,
    VariantProps<typeof buttonVariants> {
  asChild?: boolean;
}

const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant, size, ...props }, ref) => {
    return (
      <button
        ref={ref}
        className={cn(buttonVariants({ variant, size }), className)}
        {...props}
      />
    );
  }
);
Button.displayName = 'Button';

export { Button, buttonVariants };
