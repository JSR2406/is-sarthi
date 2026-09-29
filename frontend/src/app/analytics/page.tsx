'use client';

import React, { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { BarChart3, Search, Loader2, Sparkles, Building2, ChevronLeft, ChevronRight, FileCheck, Layers, ShieldCheck, AlertTriangle } from 'lucide-react';
import { fetchStandards, fetchDivisions, getStandardDetailUrl } from '@/lib/api';
import { StandardCatalogItem, DivisionStat } from '@/lib/types';
import PageHeader from '@/components/PageHeader';
import Stat from '@/components/Stat';

const PAGE_SIZE = 50;

export default function AnalyticsPage() {
  const [divisions, setDivisions] = useState<DivisionStat[]>([]);
  const [grandTotal, setGrandTotal] = useState(0);
  const [rows, setRows] = useState<StandardCatalogItem[]>([]);
  const [tableTotal, setTableTotal] = useState(0);
  const [page, setPage] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [searchKw, setSearchKw] = useState('');
  const [debouncedKw, setDebouncedKw] = useState('');
  const [divFilter, setDivFilter] = useState('All');

  useEffect(() => {
    fetchDivisions()
      .then((res) => {
        setDivisions(res.divisions);
        setGrandTotal(res.total);
      })
      .catch((err) => setError(err.message || 'Failed to load analytics'))
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    const t = setTimeout(() => {
      setDebouncedKw(searchKw);
      setPage(0);
    }, 350);
    return () => clearTimeout(t);
  }, [searchKw]);

  useEffect(() => {
    fetchStandards(divFilter, debouncedKw || undefined, { limit: PAGE_SIZE, offset: page * PAGE_SIZE })
      .then((res) => {
        setRows(res.standards);
        setTableTotal(res.total);
      })
      .catch(() => {});
  }, [divFilter, debouncedKw, page]);

  const qcoTotal = useMemo(() => divisions.reduce((n, d) => n + d.qco, 0), [divisions]);
  const outdatedTotal = useMemo(() => divisions.reduce((n, d) => n + d.outdated, 0), [divisions]);
  const enrichedTotal = useMemo(() => divisions.reduce((n, d) => n + d.enriched, 0), [divisions]);
  const enrichedPct = grandTotal ? Math.round((enrichedTotal / grandTotal) * 1000) / 10 : 0;
  const pageCount = useMemo(() => Math.max(1, Math.ceil(tableTotal / PAGE_SIZE)), [tableTotal]);

  return (
    <div className="space-y-6">
      <PageHeader
        icon={BarChart3}
        eyebrow="Corpus Analytics"
        title="Bureau of Indian Standards (BIS) Corpus Analytics"
        description={`Inspect catalog coverage, division distribution, and mandatory certification rules across the unified national standards corpus (${grandTotal.toLocaleString()} records).`}
      />

      {loading && (
        <div className="h-48 bg-white border border-slate-200 rounded-xl flex items-center justify-center text-slate-500 text-sm gap-2">
          <Loader2 className="w-5 h-5 animate-spin text-blue-600" />
          <span>Loading corpus metrics…</span>
        </div>
      )}

      {error && (
        <div className="bg-red-50 border border-red-300 text-red-900 p-4 rounded-xl text-sm">
          ⚠️ {error}
        </div>
      )}

      {!loading && !error && (
        <>
          {/* Metric Cards */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            <Stat icon={FileCheck} label="Indexed Standards" value={grandTotal.toLocaleString()} sub="Unified national corpus" tone="blue" />
            <Stat icon={Layers} label="Active Divisions" value={divisions.length} sub="BIS departments" tone="indigo" />
            <Stat icon={ShieldCheck} label="Mandatory ISI / QCO" value={qcoTotal.toLocaleString()} sub="Gazette enforceable" tone="amber" />
            <Stat icon={AlertTriangle} label="Superseded / Withdrawn" value={outdatedTotal.toLocaleString()} sub="Outdated citations" tone="red" />
          </div>

          {/* Enrichment & freshness */}
          <div className="card-pad !py-3">
            <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
              <p className="text-xs text-slate-600">
                <strong className="font-semibold text-govNavy-900">Enrichment:</strong>{' '}
                {enrichedTotal.toLocaleString()} of {grandTotal.toLocaleString()} records ({enrichedPct}%)
                carry full scope, normative references, and certification dossiers — the rest are
                verified catalogue metadata.
              </p>
              <p className="shrink-0 text-[11px] text-slate-400">
                Snapshot: curated seed + BIS catalogue ingest (Sep 2026) · served live by API
              </p>
            </div>
            <div className="mt-2 h-2 overflow-hidden rounded-full bg-slate-100">
              <div className="h-full rounded-full bg-gradient-to-r from-blue-600 to-govSaffron-500" style={{ width: `${Math.max(enrichedPct, 1.5)}%` }} />
            </div>
          </div>

          {/* Main Grid: Division Distribution & Interactive Table */}
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            {/* Standards by Division */}
            <div className="bg-white border border-slate-200 rounded-xl p-5 shadow-sm">
              <h3 className="text-sm font-bold text-govNavy-900 mb-4 pb-2 border-b border-slate-100 flex items-center justify-between">
                <span>Standards by Division</span>
                <span className="text-xs font-normal text-slate-500">{divisions.length} divisions</span>
              </h3>

              <div className="space-y-4 text-xs max-h-[420px] overflow-y-auto pr-1">
                {divisions.map((div) => {
                  const pct = Math.round((div.total / (grandTotal || 1)) * 100);
                  return (
                    <div key={div.division} className="space-y-1">
                      <div className="flex items-center justify-between font-semibold text-slate-700">
                        <span>{div.division} Division</span>
                        <span>
                          {div.total.toLocaleString()} ({pct}%)
                        </span>
                      </div>
                      <div className="w-full bg-slate-100 rounded-full h-2.5 overflow-hidden">
                        <div
                          className="bg-govNavy-800 h-2.5 rounded-full transition-all duration-500"
                          style={{ width: `${Math.max(pct, 2)}%` }}
                        />
                      </div>
                    </div>
                  );
                })}
              </div>

              <div className="mt-6 pt-4 border-t border-slate-100 text-xs text-slate-500 space-y-1.5">
                <p>
                  <strong>ETD</strong>: Electrotechnical Division
                </p>
                <p>
                  <strong>CED</strong>: Civil Engineering Division
                </p>
                <p>
                  <strong>MTD</strong>: Metallurgical Engineering Division
                </p>
              </div>
            </div>

            {/* Filterable Catalog Table */}
            <div className="lg:col-span-2 bg-white border border-slate-200 rounded-xl p-5 shadow-sm flex flex-col">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-4 pb-3 border-b border-slate-100">
                <h3 className="text-sm font-bold text-govNavy-900">
                  Filterable Catalog ({tableTotal.toLocaleString()} standards)
                </h3>

                <div className="flex items-center gap-2">
                  <div className="relative">
                    <Search className="w-3.5 h-3.5 absolute left-2.5 top-2.5 text-slate-400" />
                    <input
                      type="text"
                      placeholder="Search catalog..."
                      value={searchKw}
                      onChange={(e) => setSearchKw(e.target.value)}
                      className="bg-slate-50 border border-slate-300 rounded-lg pl-8 pr-3 py-1.5 text-xs text-slate-800 focus:outline-none focus:ring-1 focus:ring-blue-600 w-44"
                    />
                  </div>

                  <select
                    value={divFilter}
                    onChange={(e) => { setDivFilter(e.target.value); setPage(0); }}
                    className="bg-slate-50 border border-slate-300 rounded-lg px-2.5 py-1.5 text-xs text-slate-800 font-medium"
                  >
                    <option value="All">All Divisions</option>
                    {divisions.map((d) => (
                      <option key={d.division} value={d.division}>
                        {d.division}
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              {/* Table */}
              <div className="flex-1 overflow-x-auto overflow-y-auto max-h-[460px] border border-slate-100 rounded-lg">
                <table className="min-w-full divide-y divide-slate-200 text-left text-xs">
                  <thead className="bg-slate-50 sticky top-0 font-semibold text-slate-700">
                    <tr>
                      <th className="py-2.5 px-3">IS Number</th>
                      <th className="py-2.5 px-3">Tier</th>
                      <th className="py-2.5 px-3">Title</th>
                      <th className="py-2.5 px-2">Div</th>
                      <th className="py-2.5 px-2">Status</th>
                      <th className="py-2.5 px-2">QCO</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 bg-white text-slate-700">
                    {rows.map((item) => (
                      <tr key={item.is_number} className="hover:bg-slate-50/80 transition-colors">
                        <td className="py-2 px-3 font-mono font-bold text-govNavy-900 whitespace-nowrap">
                          <Link
                            href={getStandardDetailUrl(item.is_number)}
                            className="hover:text-blue-600 hover:underline inline-flex items-center gap-1"
                          >
                            {item.is_number}
                          </Link>
                        </td>
                        <td className="py-2 px-3 whitespace-nowrap">
                          {item.tier === 'catalogue' ? (
                            <span className="inline-flex items-center gap-1 bg-slate-100 text-slate-700 border border-slate-300 px-2 py-0.5 rounded text-[10px] font-semibold">
                              <Building2 className="w-3 h-3 text-slate-500" />
                              <span>Official BIS Catalogue</span>
                            </span>
                          ) : (
                            <span className="inline-flex items-center gap-1 bg-blue-50 text-blue-800 border border-blue-200 px-2 py-0.5 rounded text-[10px] font-semibold">
                              <Sparkles className="w-3 h-3 text-blue-600" />
                              <span>Seed Enriched Dossier</span>
                            </span>
                          )}
                        </td>
                        <td className="py-2 px-3 max-w-xs truncate" title={item.title}>
                          {item.title}
                        </td>
                        <td className="py-2 px-2 text-slate-500 font-medium whitespace-nowrap">{item.division}</td>
                        <td className="py-2 px-2 whitespace-nowrap">
                          <span
                            className={`inline-block px-2 py-0.5 rounded text-[10px] font-semibold ${
                              item.status === 'current'
                                ? 'bg-emerald-50 text-emerald-700 border border-emerald-200'
                                : 'bg-red-50 text-red-700 border border-red-200'
                            }`}
                          >
                            {item.status}
                          </span>
                        </td>
                        <td className="py-2 px-2 whitespace-nowrap">
                          {item.mandatory_qco ? (
                            <span className="text-amber-700 font-semibold text-[11px]">Yes</span>
                          ) : (
                            <span className="text-slate-400 text-[11px]">No</span>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              <div className="flex items-center justify-between pt-3 text-xs text-slate-500">
                <span>Page {page + 1} of {Math.max(1, Math.ceil(tableTotal / PAGE_SIZE)).toLocaleString()}</span>
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
                    disabled={(page + 1) * PAGE_SIZE >= tableTotal}
                    onClick={() => setPage((p) => p + 1)}
                    className="p-2 rounded border border-slate-200 disabled:opacity-40 hover:bg-slate-50"
                    aria-label="Next page"
                  >
                    <ChevronRight className="w-3.5 h-3.5" />
                  </button>
                </span>
              </div>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
