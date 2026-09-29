'use client';

import React, { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { LayoutGrid, Search, Loader2, Columns, ChevronLeft, ChevronRight, SearchX, Landmark, ArrowRight } from 'lucide-react';
import { fetchStandards, fetchDivisions, getStandardDetailUrl } from '@/lib/api';
import { StandardCatalogItem, DepartmentStat } from '@/lib/types';
import StatusChip from '@/components/StatusChip';
import CertBadge from '@/components/CertBadge';
import SourceTrace from '@/components/SourceTrace';
import PageHeader from '@/components/PageHeader';
import EmptyState from '@/components/EmptyState';

type SortKey = 'is_number' | 'title' | 'division' | 'status';

const PAGE_SIZE = 50;

export default function BrowsePage() {
  const [rows, setRows] = useState<StandardCatalogItem[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  const [debouncedSearch, setDebouncedSearch] = useState('');
  const [divisions, setDivisions] = useState<string[]>([]);
  const [departments, setDepartments] = useState<DepartmentStat[]>([]);
  const [showDepartments, setShowDepartments] = useState(true);
  const [statuses] = useState(['current', 'withdrawn', 'superseded']);
  const [divFilter, setDivFilter] = useState('All');
  const [statusFilter, setStatusFilter] = useState('All');
  const [qcoOnly, setQcoOnly] = useState(false);
  const [sortKey, setSortKey] = useState<SortKey>('is_number');
  const [tray, setTray] = useState<string[]>([]);

  useEffect(() => {
    fetchDivisions()
      .then((res) => {
        setDivisions(res.divisions.map((d) => d.division));
        setDepartments(res.departments || []);
      })
      .catch(() => {});
    try {
      const alias = new URLSearchParams(window.location.search).get('division');
      if (alias) setDivFilter(alias);
    } catch { /* ignore */ }
  }, []);

  useEffect(() => {
    const t = setTimeout(() => {
      setDebouncedSearch(search);
      setPage(0);
    }, 350);
    return () => clearTimeout(t);
  }, [search]);

  useEffect(() => {
    setLoading(true);
    setError(null);
    fetchStandards(divFilter, debouncedSearch || undefined, {
      status: statusFilter,
      qcoOnly,
      sort: sortKey,
      limit: PAGE_SIZE,
      offset: page * PAGE_SIZE,
    })
      .then((res) => {
        setRows(res.standards);
        setTotal(res.total);
      })
      .catch((err) => setError(err.message || 'Failed to load catalog'))
      .finally(() => setLoading(false));
  }, [divFilter, debouncedSearch, statusFilter, qcoOnly, sortKey, page]);

  const pageCount = useMemo(() => Math.max(1, Math.ceil(total / PAGE_SIZE)), [total]);

  const toggleTray = (id: string) => {
    setTray((prev) =>
      prev.includes(id) ? prev.filter((t) => t !== id) : [...prev, id].slice(0, 4)
    );
  };

  return (
    <div className="space-y-6">
      <PageHeader
        icon={LayoutGrid}
        eyebrow="Catalogue"
        title="Browse Standards"
        description={`The full unified corpus — enriched dossiers plus the national BIS catalogue (${total.toLocaleString()} records). Filter by division, status, and certification. Tick up to 4 standards to compare side-by-side.`}
      />

      {tray.length > 0 && (
        <div className="bg-blue-50 border border-blue-200 rounded-xl px-4 py-2.5 flex items-center justify-between text-sm">
          <span className="text-blue-900 font-medium">
            {tray.length} selected for comparison: {tray.join(', ')}
          </span>
          <Link
            href={`/compare?ids=${tray.map(encodeURIComponent).join(',')}`}
            className="flex items-center gap-1.5 bg-govNavy-900 hover:bg-govNavy-800 text-white px-3.5 py-1.5 rounded-lg text-xs font-semibold"
          >
            <Columns className="w-3.5 h-3.5" />
            <span>Compare{tray.length >= 2 ? '' : ' (pick ≥2)'}</span>
          </Link>
        </div>
      )}

      {departments.length > 0 && (
        <div className="card-pad">
          <button
            type="button"
            onClick={() => setShowDepartments((v) => !v)}
            className="flex w-full items-center justify-between gap-2 text-left"
          >
            <span className="flex items-center gap-2 text-sm font-bold text-govNavy-900">
              <Landmark className="h-4 w-4 text-govSaffron-500" aria-hidden />
              Departments
            </span>
            <span className="text-[11px] font-medium text-slate-400">
              {departments.length} departments · {showDepartments ? 'hide' : 'show'}
            </span>
          </button>
          {showDepartments && (
            <div className="mt-3 grid grid-cols-1 gap-2 sm:grid-cols-2 xl:grid-cols-3">
              {departments.map((d) => {
                const active = d.alias !== null && divFilter === d.alias;
                return (
                  <button
                    key={d.name}
                    type="button"
                    onClick={() => {
                      if (d.alias) {
                        setDivFilter(d.alias);
                        setSearch('');
                      } else {
                        setDivFilter('All');
                        setSearch(d.name);
                      }
                      setPage(0);
                    }}
                    title={active ? 'Filtered — click again to clear' : `Browse ${d.name}`}
                    className={`group flex items-center justify-between gap-2 rounded-lg border px-3 py-2.5 text-left transition-colors ${
                      active
                        ? 'border-blue-300 bg-blue-50'
                        : 'border-slate-200 bg-white hover:border-blue-300 hover:bg-blue-50/50'
                    }`}
                  >
                    <span className="min-w-0">
                      <span className="block truncate text-xs font-bold text-slate-800" title={d.name}>
                        {d.name}
                      </span>
                      <span className="mt-0.5 block text-[11px] tabular-nums text-slate-400">
                        {d.total.toLocaleString()} standards{d.alias ? ` · ${d.alias}` : ''}
                      </span>
                    </span>
                    <ArrowRight className="h-3.5 w-3.5 shrink-0 text-slate-300 transition-transform group-hover:translate-x-0.5 group-hover:text-blue-500" aria-hidden />
                  </button>
                );
              })}
            </div>
          )}
        </div>
      )}

      <div className="bg-white border border-slate-200 rounded-xl p-4 shadow-sm flex flex-col md:flex-row md:items-center gap-3">
        <div className="relative flex-1">
          <Search className="w-3.5 h-3.5 absolute left-2.5 top-2.5 text-slate-400" />
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search number, title, department, aspect…"
            className="w-full bg-slate-50 border border-slate-300 rounded-lg pl-8 pr-3 py-1.5 text-xs text-slate-800 focus:outline-none focus:ring-1 focus:ring-blue-600"
          />
        </div>
        <select
          value={divFilter}
          onChange={(e) => { setDivFilter(e.target.value); setPage(0); }}
          className="bg-slate-50 border border-slate-300 rounded-lg px-2.5 py-1.5 text-xs font-medium"
        >
          <option value="All">All Divisions</option>
          {divisions.map((d) => (
            <option key={d} value={d}>{d}</option>
          ))}
        </select>
        <select
          value={statusFilter}
          onChange={(e) => { setStatusFilter(e.target.value); setPage(0); }}
          className="bg-slate-50 border border-slate-300 rounded-lg px-2.5 py-1.5 text-xs font-medium"
        >
          <option value="All">All Statuses</option>
          {statuses.map((s) => (
            <option key={s} value={s}>{s}</option>
          ))}
        </select>
        <select
          value={sortKey}
          onChange={(e) => setSortKey(e.target.value as SortKey)}
          className="bg-slate-50 border border-slate-300 rounded-lg px-2.5 py-1.5 text-xs font-medium"
        >
          <option value="is_number">Sort: IS Number</option>
          <option value="title">Sort: Title</option>
          <option value="division">Sort: Division</option>
          <option value="status">Sort: Status</option>
        </select>
        <label className="flex items-center gap-1.5 text-xs text-slate-600 font-medium whitespace-nowrap">
          <input type="checkbox" checked={qcoOnly} onChange={(e) => { setQcoOnly(e.target.checked); setPage(0); }} className="h-4 w-4 accent-blue-700" />
          <span>Mandatory QCO only</span>
        </label>
      </div>

      {loading && (
        <div className="h-64 bg-white border border-slate-200 rounded-xl flex items-center justify-center text-slate-500 text-sm gap-2">
          <Loader2 className="w-5 h-5 animate-spin text-blue-600" />
          <span>Loading catalog…</span>
        </div>
      )}

      {error && (
        <div className="bg-red-50 border border-red-300 text-red-900 p-4 rounded-xl text-sm">
          ⚠️ {error}
        </div>
      )}

      {!loading && !error && (
        <div className="bg-white border border-slate-200 rounded-xl shadow-sm overflow-hidden">
          <div className="px-4 py-2.5 border-b border-slate-100 text-xs text-slate-500 font-medium flex items-center justify-between">
            <span>{total.toLocaleString()} standards · page {page + 1} of {pageCount.toLocaleString()}</span>
            <span className="flex items-center gap-1">
              <button
                type="button"
                disabled={page === 0}
                onClick={() => setPage((p) => Math.max(0, p - 1))}
                className="p-2 rounded border border-slate-200 disabled:opacity-40 hover:bg-slate-50"
                aria-label="Previous page"
              >
                <ChevronLeft className="w-3.5 h-3.5" />
              </button>
              <button
                type="button"
                disabled={page + 1 >= pageCount}
                onClick={() => setPage((p) => p + 1)}
                className="p-2 rounded border border-slate-200 disabled:opacity-40 hover:bg-slate-50"
                aria-label="Next page"
              >
                <ChevronRight className="w-3.5 h-3.5" />
              </button>
            </span>
          </div>
          {rows.length === 0 ? (
            <EmptyState
              icon={SearchX}
              title="No standards match these filters"
              body="Clear the search or widen the division/status filters."
            />
          ) : (
            <div className="overflow-x-auto max-h-[560px] overflow-y-auto">
              <table className="min-w-full divide-y divide-slate-200 text-left text-xs">
                <thead className="bg-slate-50 sticky top-0 font-semibold text-slate-700">
                  <tr>
                    <th className="py-2.5 px-3 w-10">＋</th>
                    <th className="py-2.5 px-3">IS Number</th>
                    <th className="py-2.5 px-3">Title</th>
                    <th className="py-2.5 px-2">Div</th>
                    <th className="py-2.5 px-2">Status</th>
                    <th className="py-2.5 px-2">Cert</th>
                    <th className="py-2.5 px-2">Source</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 text-slate-700">
                  {rows.map((s) => (
                    <tr key={s.is_number} className="hover:bg-slate-50/80">
                      <td className="py-2 px-3">
                        <input
                          type="checkbox"
                          checked={tray.includes(s.is_number)}
                          onChange={() => toggleTray(s.is_number)}
                          title="Add to compare tray (max 4)"
                          aria-label={`Add ${s.is_number} to compare tray`}
                          className="h-5 w-5 accent-blue-700"
                        />
                      </td>
                      <td className="py-2 px-3 font-mono font-bold text-govNavy-900 whitespace-nowrap">
                        <Link
                          href={getStandardDetailUrl(s.is_number)}
                          className="hover:text-blue-600 hover:underline"
                        >
                          {s.is_number}
                        </Link>
                      </td>
                      <td className="py-2 px-3 max-w-xs truncate" title={s.title}>{s.title}</td>
                      <td className="py-2 px-2 font-medium" title={s.department_name || undefined}>{s.division}</td>
                      <td className="py-2 px-2"><StatusChip status={s.status} /></td>
                      <td className="py-2 px-2"><CertBadge certification={s.certification} /></td>
                      <td className="py-2 px-2">
                        <SourceTrace tier={s.tier} isEnriched={s.is_enriched} />
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
