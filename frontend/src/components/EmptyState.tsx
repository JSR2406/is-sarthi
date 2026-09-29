import React from 'react';
import type { LucideIcon } from 'lucide-react';

interface EmptyStateProps {
  icon: LucideIcon;
  title: string;
  body?: string;
  action?: React.ReactNode;
}

/** Consistent empty state: centered icon, title, explanation, optional action. */
export default function EmptyState({ icon: Icon, title, body, action }: EmptyStateProps) {
  return (
    <div className="card p-10 text-center">
      <Icon className="mx-auto h-10 w-10 text-slate-300" aria-hidden />
      <h3 className="mt-3 text-base font-bold text-govNavy-900">{title}</h3>
      {body && <p className="mx-auto mt-1 max-w-md text-xs leading-relaxed text-slate-500">{body}</p>}
      {action && <div className="mt-4">{action}</div>}
    </div>
  );
}
