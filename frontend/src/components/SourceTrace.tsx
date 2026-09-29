import React from 'react';
import { Building2, Sparkles } from 'lucide-react';

export default function SourceTrace({
  tier,
  isEnriched,
  division,
}: {
  tier?: string;
  isEnriched?: boolean;
  division?: string;
}) {
  const enriched = isEnriched || tier === 'enriched';
  return (
    <span className="inline-flex items-center gap-1 text-[10px] font-semibold">
      {enriched ? (
        <span className="inline-flex items-center gap-1 bg-blue-50 text-blue-800 border border-blue-200 px-2 py-0.5 rounded">
          <Sparkles className="w-3 h-3 text-blue-600" />
          <span>Seed Enriched Dossier</span>
        </span>
      ) : (
        <span className="inline-flex items-center gap-1 bg-slate-100 text-slate-700 border border-slate-300 px-2 py-0.5 rounded">
          <Building2 className="w-3 h-3 text-slate-500" />
          <span>Official BIS Catalogue</span>
        </span>
      )}
      {division && <span className="text-slate-400 font-medium">· {division}</span>}
    </span>
  );
}
