import React from 'react';
import type { LucideIcon } from 'lucide-react';

type Tone = 'navy' | 'blue' | 'indigo' | 'amber' | 'red' | 'emerald';

const TONE_ICON: Record<Tone, string> = {
  navy: 'text-govNavy-900',
  blue: 'text-blue-600',
  indigo: 'text-indigo-600',
  amber: 'text-amber-600',
  red: 'text-red-600',
  emerald: 'text-emerald-600',
};

const TONE_VALUE: Record<Tone, string> = {
  navy: 'text-govNavy-900',
  blue: 'text-govNavy-900',
  indigo: 'text-govNavy-900',
  amber: 'text-amber-600',
  red: 'text-red-600',
  emerald: 'text-emerald-700',
};

interface StatProps {
  icon: LucideIcon;
  label: string;
  value: React.ReactNode;
  sub?: string;
  tone?: Tone;
}

/** Single metric card for dashboards and summary rows. */
export default function Stat({ icon: Icon, label, value, sub, tone = 'navy' }: StatProps) {
  return (
    <div className="card p-4">
      <div className="flex items-center justify-between gap-2">
        <span className="text-xs font-medium text-slate-500">{label}</span>
        <Icon className={`h-4 w-4 ${TONE_ICON[tone]}`} aria-hidden />
      </div>
      <div className={`mt-1 text-2xl font-bold tabular-nums ${TONE_VALUE[tone]}`}>{value}</div>
      {sub && <div className="mt-0.5 text-[11px] text-slate-400">{sub}</div>}
    </div>
  );
}
