import React from 'react';
import type { LucideIcon } from 'lucide-react';

interface PageHeaderProps {
  icon: LucideIcon;
  title: string;
  description?: string;
  eyebrow?: string;
  actions?: React.ReactNode;
}

/** Consistent page header: eyebrow, icon title, muted description, optional actions. */
export default function PageHeader({ icon: Icon, title, description, eyebrow, actions }: PageHeaderProps) {
  return (
    <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
      <div className="min-w-0">
        {eyebrow && <p className="eyebrow">{eyebrow}</p>}
        <h2 className="page-title">
          <Icon className="h-6 w-6 shrink-0 text-govSaffron-500" aria-hidden />
          <span>{title}</span>
        </h2>
        {description && <p className="page-sub">{description}</p>}
      </div>
      {actions && <div className="flex shrink-0 flex-wrap items-center gap-2">{actions}</div>}
    </div>
  );
}
