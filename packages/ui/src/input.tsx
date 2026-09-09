import * as React from 'react';

import { cn } from './cn';

const fieldClassName =
  'w-full rounded-md border border-border bg-raised text-sm text-foreground placeholder:text-faint-foreground focus:border-primary focus:outline-none focus:ring-1 focus:ring-[var(--lz-blue-muted)] disabled:pointer-events-none disabled:opacity-50';

export const Input = React.forwardRef<
  HTMLInputElement,
  React.InputHTMLAttributes<HTMLInputElement>
>(function Input({ className, ...props }, ref) {
  return <input ref={ref} className={cn(fieldClassName, 'h-[34px] px-3', className)} {...props} />;
});

export const Textarea = React.forwardRef<
  HTMLTextAreaElement,
  React.TextareaHTMLAttributes<HTMLTextAreaElement>
>(function Textarea({ className, ...props }, ref) {
  return (
    <textarea
      ref={ref}
      className={cn(fieldClassName, 'min-h-[88px] px-3 py-2', className)}
      {...props}
    />
  );
});
