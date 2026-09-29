import React from 'react';

const STYLES: Record<string, string> = {
  current: 'bg-emerald-50 text-emerald-700 border-emerald-200',
  withdrawn: 'bg-rose-50 text-rose-700 border-rose-300',
  superseded: 'bg-red-50 text-red-700 border-red-200',
  under_revision: 'bg-amber-50 text-amber-700 border-amber-300',
};

export default function StatusChip({ status }: { status?: string }) {
  const key = (status || 'current').toLowerCase();
  const style = STYLES[key] || 'bg-slate-100 text-slate-700 border-slate-300';
  return (
    <span
      className={`inline-block px-2 py-0.5 rounded text-[10px] font-semibold border whitespace-nowrap ${style}`}
    >
      {status || 'current'}
    </span>
  );
}
