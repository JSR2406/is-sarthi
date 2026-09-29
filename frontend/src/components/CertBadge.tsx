import React from 'react';
import { Certification } from '@/lib/types';

export default function CertBadge({ certification }: { certification?: Certification | null }) {
  if (!certification || !certification.scheme) {
    return (
      <span className="inline-block px-2 py-0.5 rounded text-[10px] font-semibold bg-slate-100 text-slate-500 border border-slate-200 whitespace-nowrap">
        Voluntary
      </span>
    );
  }
  if (certification.mandatory) {
    return (
      <span
        className="inline-block px-2 py-0.5 rounded text-[10px] font-semibold bg-amber-50 text-amber-700 border border-amber-300 whitespace-nowrap"
        title={certification.scheme_label || certification.scheme}
      >
        QCO · {certification.scheme}
      </span>
    );
  }
  return (
    <span className="inline-block px-2 py-0.5 rounded text-[10px] font-semibold bg-blue-50 text-blue-700 border border-blue-200 whitespace-nowrap">
      {certification.scheme}
    </span>
  );
}
