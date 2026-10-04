'use client';

import type { ButtonHTMLAttributes, ReactNode } from 'react';
import { Button } from '@/components/ui';

/**
 * Secondary Masterlist toolbar button (Columns, Export, module tools). Shows icon + label;
 * when the list is narrow (a Detail Panel is open beside it) CSS hides the label and keeps the
 * icon, so the toolbar stays on one row. The name stays on the button (`aria-label`, tooltip).
 */
export function ToolbarButton({ label, icon, loading, ...rest }: {
  label: string;
  icon: ReactNode;
  loading?: boolean;
} & Omit<ButtonHTMLAttributes<HTMLButtonElement>, 'children'>) {
  return (
    <Button size="sm" className="ml-btn--collapsible" aria-label={label} title={label} loading={loading} {...rest}>
      {icon}<span className="ml-btn-label">{label}</span>
    </Button>
  );
}
