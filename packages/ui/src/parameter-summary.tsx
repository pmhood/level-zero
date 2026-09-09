import { formatParameterValue, groupParameters, type Parameter } from '@level-zero/domain';
import * as React from 'react';

import { cn } from './cn';

export interface ParameterSummaryProps {
  parameters: readonly Parameter[];
  /** What to show when there is nothing to show. Omit to render nothing at all. */
  emptyLabel?: React.ReactNode;
  className?: string;
}

/**
 * A parameter list, read only and compact — label on the left, value on the
 * right, categories kept apart.
 *
 * Takes nothing but the parameters, so the same rows serve a GDD embed, a
 * compare column and a prototype summary as well as the workspace they were
 * tuned in.
 */
export function ParameterSummary({ parameters, emptyLabel, className }: ParameterSummaryProps) {
  if (parameters.length === 0) {
    return emptyLabel ? <p className="text-xs text-faint-foreground">{emptyLabel}</p> : null;
  }

  return (
    <dl className={cn('flex flex-col gap-3 text-sm', className)}>
      {groupParameters(parameters).map((group) => (
        <div key={group.name ?? ''} className="flex flex-col gap-1">
          {group.name && (
            <p className="text-xs font-medium text-faint-foreground uppercase">{group.name}</p>
          )}
          {group.parameters.map((parameter) => (
            <div
              key={parameter.id}
              className="flex items-baseline justify-between gap-3 border-b border-border-subtle py-1 last:border-b-0"
            >
              <dt className="min-w-0 truncate text-muted-foreground">{parameter.label}</dt>
              <dd className="shrink-0 font-medium tabular-nums text-foreground">
                {formatParameterValue(parameter)}
              </dd>
            </div>
          ))}
        </div>
      ))}
    </dl>
  );
}
