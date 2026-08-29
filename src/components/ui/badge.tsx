import * as React from 'react';
import { cva, type VariantProps } from 'class-variance-authority';
import { cn } from '@/lib/utils';

const badgeVariants = cva(
  'inline-flex items-center rounded px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-widest border transition-colors',
  {
    variants: {
      variant: {
        default:
          'bg-[#1b7ff0]/10 text-[#1b7ff0] border-[#1b7ff0]/20',
        critical:
          'bg-[#e5463e]/10 text-[#e5463e] border-[#e5463e]/20',
        warning:
          'bg-[#f59e0b]/10 text-[#f59e0b] border-[#f59e0b]/20',
        stable:
          'bg-[#34d399]/10 text-[#34d399] border-[#34d399]/20',
        muted:
          'bg-[#222222] text-[#666666] border-[#242424]',
      },
    },
    defaultVariants: {
      variant: 'default',
    },
  }
);

export interface BadgeProps
  extends React.HTMLAttributes<HTMLSpanElement>,
    VariantProps<typeof badgeVariants> {}

function Badge({ className, variant, ...props }: BadgeProps) {
  return (
    <span className={cn(badgeVariants({ variant }), className)} {...props} />
  );
}

export { Badge, badgeVariants };
