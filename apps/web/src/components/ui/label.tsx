/* eslint-disable jsx-a11y/label-has-associated-control -- generic primitive; callers pass htmlFor or nest the control */
import * as React from 'react';
import { cn } from '@/lib/utils';

export const Label = React.forwardRef<
  HTMLLabelElement,
  React.LabelHTMLAttributes<HTMLLabelElement>
>(({ className, ...props }, ref) => (
  <label
    ref={ref}
    className={cn('text-sm font-semibold leading-none text-foreground', className)}
    {...props}
  />
));
Label.displayName = 'Label';
