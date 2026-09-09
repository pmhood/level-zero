import { cva, type VariantProps } from 'class-variance-authority';
import * as React from 'react';

import { cn } from './cn';

/** Base card primitive (spec section 12): one reusable container, not a new
 * one per feature. `selected` and `interactive` cover the hover/selection
 * states entity cards and other clickable cards need. */
const cardVariants = cva(
  'rounded-lg border border-border bg-surface transition-colors duration-150',
  {
    variants: {
      selected: {
        true: 'border-primary ring-1 ring-[var(--lz-blue-muted)]',
      },
      interactive: {
        true: 'cursor-pointer hover:border-border-strong hover:bg-hover',
      },
      padding: {
        none: '',
        sm: 'p-2',
        md: 'p-3',
        lg: 'p-5',
      },
    },
    defaultVariants: { padding: 'lg' },
  },
);

export interface CardProps
  extends React.HTMLAttributes<HTMLDivElement>, VariantProps<typeof cardVariants> {}

export const Card = React.forwardRef<HTMLDivElement, CardProps>(function Card(
  { className, selected, interactive, padding, ...props },
  ref,
) {
  return (
    <div
      ref={ref}
      className={cn(cardVariants({ selected, interactive, padding }), className)}
      {...props}
    />
  );
});

export const CardHeader = React.forwardRef<HTMLDivElement, React.HTMLAttributes<HTMLDivElement>>(
  function CardHeader({ className, ...props }, ref) {
    return <div ref={ref} className={cn('mb-4 space-y-1', className)} {...props} />;
  },
);

export const CardTitle = React.forwardRef<
  HTMLHeadingElement,
  React.HTMLAttributes<HTMLHeadingElement>
>(function CardTitle({ className, ...props }, ref) {
  return <h3 ref={ref} className={cn('text-[15px] font-semibold', className)} {...props} />;
});

export const CardDescription = React.forwardRef<
  HTMLParagraphElement,
  React.HTMLAttributes<HTMLParagraphElement>
>(function CardDescription({ className, ...props }, ref) {
  return <p ref={ref} className={cn('text-sm text-muted-foreground', className)} {...props} />;
});

export { cardVariants };
