import * as React from 'react';
import { cn } from '@/lib/utils';

export interface TextareaProps extends React.TextareaHTMLAttributes<HTMLTextAreaElement> {}

const Textarea = React.forwardRef<HTMLTextAreaElement, TextareaProps>(
  ({ className, ...props }, ref) => {
    return (
      <textarea
        ref={ref}
        className={cn(
          'flex min-h-[80px] w-full rounded-md border border-[#242424] bg-[#1a1a1a] px-3 py-2',
          'text-sm text-[#f5f5f5] placeholder:text-[#666666]',
          'resize-y transition-colors duration-150',
          'focus:outline-none focus:border-[#1b7ff0] focus:ring-1 focus:ring-[#1b7ff0]/40',
          'disabled:cursor-not-allowed disabled:opacity-40',
          className
        )}
        {...props}
      />
    );
  }
);
Textarea.displayName = 'Textarea';

export { Textarea };
