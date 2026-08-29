import * as React from 'react';
import { cn } from '@/lib/utils';

export interface InputProps extends React.InputHTMLAttributes<HTMLInputElement> {}

const Input = React.forwardRef<HTMLInputElement, InputProps>(
  ({ className, type, ...props }, ref) => {
    return (
      <input
        type={type}
        ref={ref}
        className={cn(
          'flex h-9 w-full rounded-md border border-[#242424] bg-[#1a1a1a] px-3 py-2',
          'text-sm text-[#f5f5f5] placeholder:text-[#666666]',
          'transition-colors duration-150',
          'focus:outline-none focus:border-[#1b7ff0] focus:ring-1 focus:ring-[#1b7ff0]/40',
          'disabled:cursor-not-allowed disabled:opacity-40',
          'autofill:bg-[#1a1a1a]',
          className
        )}
        {...props}
      />
    );
  }
);
Input.displayName = 'Input';

export { Input };
