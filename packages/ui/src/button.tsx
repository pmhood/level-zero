'use client';

import { Slot } from '@radix-ui/react-slot';
import { cva, type VariantProps } from 'class-variance-authority';
import * as React from 'react';

import { cn } from './cn';

/**
 * The design system's closed set of button treatments (spec section 14).
 * `ai` is reserved for generative actions; everything deterministic uses
 * `primary`, `secondary`, `ghost` or `danger`.
 */
const buttonVariants = cva(
  'inline-flex items-center justify-center gap-2 rounded-md text-sm font-medium transition-colors duration-150 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background disabled:pointer-events-none disabled:opacity-50',
  {
    variants: {
      variant: {
        primary: 'bg-primary text-primary-foreground hover:bg-primary-hover',
        secondary: 'border border-border-strong bg-raised text-foreground hover:bg-hover',
        ghost: 'bg-transparent text-muted-foreground hover:bg-hover hover:text-foreground',
        ai: 'border border-[var(--lz-ai-border)] bg-[var(--lz-ai-muted)] text-ai-foreground hover:bg-[rgba(169,130,244,.18)]',
        danger:
          'border border-[var(--lz-error-border)] bg-[var(--lz-error-muted)] text-error hover:bg-[rgba(241,110,114,.18)]',
      },
      size: {
        sm: 'h-7 px-2.5',
        md: 'h-[34px] px-4',
        lg: 'h-10 px-6 text-base',
        icon: 'size-8 p-0',
      },
    },
    defaultVariants: { variant: 'primary', size: 'md' },
  },
);

export interface ButtonProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement>, VariantProps<typeof buttonVariants> {
  /** Render the child element instead of a `<button>` (links, `next/link`, ...). */
  asChild?: boolean;
}

export const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(function Button(
  { className, variant, size, asChild = false, ...props },
  ref,
) {
  const Component = asChild ? Slot : 'button';
  return (
    <Component className={cn(buttonVariants({ variant, size }), className)} ref={ref} {...props} />
  );
});

export { buttonVariants };
