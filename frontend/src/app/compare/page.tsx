'use client';

import React, { useEffect, useState, Suspense } from 'react';
import Link from 'next/link';
import { useSearchParams, useRouter } from 'next/navigation';
import { Columns, Loader2, ExternalLink, Network, Plus, Download, X } from 'lucide-react';
import { fetchStandardDetail, getStandardDetailUrl } from '@/lib/api';
import { StandardDetail } from '@/lib/types';
import { logHistory } from '@/lib/history';
import StatusChip from '@/components/StatusChip';
import CertBadge from '@/components/CertBadge';
import PageHeader from '@/components/PageHeader';
import EmptyState from '@/components/EmptyState';

function alliedCount(d: StandardDetail): number {
  if (!d.allied_by_role) return 0;
  return Object.values(d.allied_by_role).reduce((n, items) => n + items.length, 0);
}

function editionOf(d: StandardDetail): string {
  const base = d.year ? `${d.is_number}:${d.year}` : d.is_number;
  const amdts = d.amendments?.length ? ` +${d.amendments.length} Amdt` : '';
  return `${base}${amdts}`;
}

function scopeOf(d: StandardDetail): string {
  if (!d.scope) return '— (catalogue record: scope not published for this tier)';
  return d.scope.length > 240 ? `${d.scope.slice(0, 240)}…` : d.scope;
}

function rolesOf(d: StandardDetail): string {
  if (!d.allied_by_role || Object.keys(d.allied_by_role).length === 0) {
    return 'None mapped (catalogue record or no normative refs)';
  }
  return Object.entries(d.allied_by_role)
    .map(([role, items]) => `${role} ×${items.length}`)
    .join(' · ');
}

function CompareContent() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const idsParam = searchParams?.get('ids') || '';
  const ids = Array.from(new Set(idsParam.split(',').map((s) => s.trim()).filter(Boolean))).slice(0, 4);

  const [details, setDetails] = useState<(StandardDetail | null)[]>([]);
  const [loading, setLoading] = useState(true);
  const [errors, setErrors] = useState<string[]>([]);
  const [addInput, setAddInput] = useState('');
  const [addError, setAddError] = useState<string | null>(null);

  useEffect(() => {
    if (ids.length === 0) {
      setLoading(false);
      return;
    }
    setLoading(true);
    Promise.all(
      ids.map((id) => fetchStandardDetail(id).catch(() => null))
    ).then((rows) => {
      setDetails(rows);
      setErrors(rows.map((r, i) => (r ? '' : `Could not load '${ids[i]}'`)).filter(Boolean));
      const loaded = rows.filter(Boolean) as StandardDetail[];
      if (loaded.length >= 2) {
        try {
          logHistory('compare', loaded.map((d) => d.is_number).join(' vs '),
            `${loaded.length}-way comparison`, window.location.pathname + window.location.search);
        } catch { /* ignore */ }
      }
    }).finally(() => setLoading(false));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [idsParam]);

  const rows: { label: string; get: (d: StandardDetail) => string; differs?: boolean }[] = [];
  const loaded = details.filter(Boolean) as StandardDetail[];
  const markDiffers = (get: (d: StandardDetail) => string) =>
    loaded.length > 1 && new Set(loaded.map(get)).size > 1;

  if (loaded.length > 0) {
    rows.push(
      { label: 'Title', get: (d) => d.title || '—', differs: markDiffers((d) => d.title || '') },
      { label: 'Status', get: (d) => d.status, differs: markDiffers((d) => d.status) },
      { label: 'Edition', get: editionOf, differs: markDiffers(editionOf) },
      { label: 'Division / Dept', get: (d) => d.department_name || d.department || d.division || '—', differs: markDiffers((d) => d.department_name || d.department || d.division || '') },
      { label: 'Aspect', get: (d) => d.aspect || '—', differs: markDiffers((d) => d.aspect || '') },
      { label: 'Amendments', get: (d) => (d.amendments?.map((a) => `A${a.number}${a.date ? `(${a.date})` : ''}`).join(', ') || 'None'), differs: markDiffers((d) => JSON.stringify(d.amendments || [])) },
      { label: 'Certification', get: (d) => (d.certification?.mandatory ? `Mandatory ${d.certification.scheme || ''}` : d.certification?.scheme || 'Voluntary'), differs: markDiffers((d) => JSON.stringify(d.certification || {})) },
      { label: 'Scope', get: scopeOf, differs: markDiffers((d) => d.scope || '') },
      { label: 'Allied standards', get: (d) => String(alliedCount(d)), differs: markDiffers((d) => String(alliedCount(d))) },
      { label: 'Allied by role', get: rolesOf, differs: markDiffers(rolesOf) },
      { label: 'Published', get: (d) => d.published_on || (d.year ? String(d.year) : '—') },
      { label: 'Superseded by', get: (d) => d.superseded_by || '—' },
    );
  }

  const goIds = (next: string[]) => {
    const clean = Array.from(new Set(next.map((s) => s.trim()).filter(Boolean))).slice(0, 4);
    router.push(`/compare${clean.length ? `?ids=${clean.map(encodeURIComponent).join(',')}` : ''}`);
  };

  const addStandard = () => {
    const id = addInput.trim();
    setAddError(null);
    if (!id) return;
    if (ids.some((x) => x.toLowerCase() === id.toLowerCase())) {
      setAddError(`'${id}' is already in the comparison.`);
      return;
    }
    if (ids.length >= 4) {
      setAddError('Comparison is limited to 4 standards — remove one first.');
      return;
    }
    setAddInput('');
    goIds([...ids, id]);
  };

  const exportReport = () => {
    const lines = [`# IS Sarthi Comparison Report`, `Standards: ${loaded.map((d) => d.is_number).join(', ')}`, ''];
    rows.forEach((row) => {
      lines.push(`## ${row.label}${row.differs ? ' (differs)' : ''}`);
      loaded.forEach((d) => lines.push(`- **${d.is_number}**: ${row.get(d)}`));
      lines.push('');
    });
    const blob = new Blob([lines.join('\n')], { type: 'text/markdown' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `is_sarthi_compare_${Date.now()}.md`;
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="space-y-6">
      <PageHeader
        icon={Columns}
        eyebrow="Side-by-side"
        title="Compare Standards"
        description="Edition, scope, amendment, certification, and relation comparison for up to 4 standards. Rows marked ◆ differ across the selection."
      />

      {/* Add / export bar */}
      <div className="card-pad !py-3">
        <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
          <div className="relative flex-1">
            <input
              type="text"
              value={addInput}
              onChange={(e) => setAddInput(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') addStandard();
              }}
              placeholder="Add a standard by IS number — e.g. IS 1786"
              className="input font-mono"
            />
          </div>
          <div className="flex shrink-0 items-center gap-2">
            <button type="button" onClick={addStandard} disabled={!addInput.trim()} className="btn-secondary">
              <Plus className="h-3.5 w-3.5" aria-hidden />
              <span>Add standard</span>
            </button>
            {loaded.length >= 2 && (
              <button type="button" onClick={exportReport} className="btn-secondary">
                <Download className="h-3.5 w-3.5" aria-hidden />
                <span>Export report</span>
              </button>
            )}
          </div>
        </div>
        {addError && <p className="mt-1.5 text-xs text-red-700">⚠️ {addError}</p>}
        {ids.length > 0 && (
          <p className="mt-1.5 text-[11px] text-slate-500">
            Comparing: {ids.join(' · ')} — click × on any column to remove it.
          </p>
        )}
      </div>

      {loading && (
        <div className="h-64 bg-white border border-slate-200 rounded-xl flex items-center justify-center text-slate-500 text-sm gap-2">
          <Loader2 className="w-5 h-5 animate-spin text-blue-600" />
          <span>Loading dossiers for comparison…</span>
        </div>
      )}

      {!loading && ids.length < 2 && (
        <EmptyState
          icon={Columns}
          title="Select 2–4 standards to compare"
          body="Tick standards in Browse and click Compare, or open any dossier and follow related standards."
          action={
            <Link
              href="/browse"
              className="btn-primary"
            >
              Browse standards
            </Link>
          }
        />
      )}

      {!loading && errors.length > 0 && (
        <div className="bg-red-50 border border-red-300 text-red-900 p-4 rounded-xl text-sm">
          ⚠️ {errors.join('; ')}
        </div>
      )}

      {!loading && loaded.length >= 2 && (
        <div className="bg-white border border-slate-200 rounded-xl shadow-sm overflow-x-auto">
          <table className="min-w-full divide-y divide-slate-200 text-xs">
            <thead className="bg-slate-50">
              <tr>
                <th className="py-3 px-3 text-left font-semibold text-slate-500 w-36">Attribute</th>
                {loaded.map((d) => (
                  <th key={d.is_number} className="py-3 px-3 text-left">
                    <span className="flex items-start justify-between gap-1">
                      <Link
                        href={getStandardDetailUrl(d.is_number)}
                        className="font-mono font-bold text-govNavy-900 hover:text-blue-700 hover:underline inline-flex items-center gap-1"
                      >
                        <span>{d.is_number}</span>
                        <ExternalLink className="w-3 h-3 text-slate-400" />
                      </Link>
                      <button
                        type="button"
                        onClick={() => goIds(ids.filter((x) => x !== d.is_number))}
                        title={`Remove ${d.is_number} from comparison`}
                        aria-label={`Remove ${d.is_number} from comparison`}
                        className="rounded p-1.5 text-slate-400 hover:bg-red-50 hover:text-red-600"
                      >
                        <X className="h-3.5 w-3.5" aria-hidden />
                      </button>
                    </span>
                    <div className="mt-1 flex gap-1 flex-wrap">
                      <StatusChip status={d.status} />
                      <CertBadge certification={d.certification} />
                    </div>
                  </th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 text-slate-700">
              {rows.map((row) => (
                <tr key={row.label} className="hover:bg-slate-50/60">
                  <td className="py-2.5 px-3 font-semibold text-slate-600 whitespace-nowrap">
                    {row.differs && <span className="text-amber-500 mr-1" title="Values differ">◆</span>}
                    {row.label}
                  </td>
                  {loaded.map((d) => (
                    <td
                      key={d.is_number}
                      className={`py-2.5 px-3 align-top ${row.differs ? 'bg-amber-50/50' : ''}`}
                    >
                      {row.get(d)}
                    </td>
                  ))}
                </tr>
              ))}
              <tr>
                <td className="py-2.5 px-3 font-semibold text-slate-600">Links</td>
                {loaded.map((d) => (
                  <td key={d.is_number} className="py-2.5 px-3">
                    <div className="flex flex-col gap-1">
                      <Link href={getStandardDetailUrl(d.is_number)} className="text-blue-700 hover:underline font-medium">
                        Open dossier →
                      </Link>
                      <Link href={`/graph?standard=${encodeURIComponent(d.is_number)}`} className="text-blue-700 hover:underline font-medium inline-flex items-center gap-1">
                        <Network className="w-3 h-3" />
                        <span>Citation graph</span>
                      </Link>
                    </div>
                  </td>
                ))}
              </tr>
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

export default function ComparePage() {
  return (
    <Suspense
      fallback={
        <div className="h-64 bg-white border border-slate-200 rounded-xl flex items-center justify-center text-slate-500 text-sm gap-2">
          <Loader2 className="w-5 h-5 animate-spin text-blue-600" />
          <span>Loading comparison…</span>
        </div>
      }
    >
      <CompareContent />
    </Suspense>
  );
}
