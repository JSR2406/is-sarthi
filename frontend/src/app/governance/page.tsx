'use client';

import React, { useEffect, useState } from 'react';
import Link from 'next/link';
import { Landmark, Loader2, FileCheck, ShieldCheck, AlertTriangle, Layers } from 'lucide-react';
import { fetchHealth, fetchDivisions, fetchReviewQueue } from '@/lib/api';
import { DivisionStat, ReviewQueueItem } from '@/lib/types';
import { getCorrections, clearCorrections, exportCorrections } from '@/lib/corrections';
import PageHeader from '@/components/PageHeader';
import Stat from '@/components/Stat';
import SectionCard from '@/components/SectionCard';

export default function GovernancePage() {
  const [health, setHealth] = useState<{ status: string; standards_indexed: number } | null>(null);
  const [divisions, setDivisions] = useState<DivisionStat[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [reviews, setReviews] = useState<ReviewQueueItem[]>([]);
  const [reviewNotice, setReviewNotice] = useState<string | null>(null);
  const [correctionCount, setCorrectionCount] = useState(0);

  useEffect(() => {
    fetchReviewQueue('pending', 20)
      .then((res) => {
        setReviews(res.items);
        setReviewNotice(res.notice || null);
      })
      .catch(() => setReviewNotice('Review store unreachable.'));
    setCorrectionCount(getCorrections().length);
  }, []);

  useEffect(() => {
    Promise.all([fetchHealth().catch(() => null), fetchDivisions().catch(() => null)])
      .then(([h, d]) => {
        if (!h && !d) {
          setError('Governance data is unreachable. Check that the API is running.');
          return;
        }
        if (h) setHealth(h as { status: string; standards_indexed: number });
        if (d) {
          setDivisions(d.divisions);
          setTotal(d.total);
        }
      })
      .finally(() => setLoading(false));
  }, []);

  const qco = divisions.reduce((n, d) => n + d.qco, 0);
  const outdated = divisions.reduce((n, d) => n + d.outdated, 0);
  const enriched = divisions.reduce((n, d) => n + d.enriched, 0);

  return (
    <div className="space-y-6">
      <PageHeader
        icon={Landmark}
        eyebrow="Oversight"
        title="Governance & Monitoring"
        description="Oversight view for BIS administrators: corpus coverage, certification exposure, and outdated-citation risk. Live pipeline run metrics (ingestion_runs) wire in with the Postgres backend; this view reflects the currently served corpus."
      />

      {loading && (
        <div className="h-48 bg-white border border-slate-200 rounded-xl flex items-center justify-center text-slate-500 text-sm gap-2">
          <Loader2 className="w-5 h-5 animate-spin text-blue-600" />
          <span>Loading oversight metrics…</span>
        </div>
      )}

      {error && (
        <div className="bg-red-50 border border-red-300 text-red-900 p-4 rounded-xl text-sm">
          ⚠️ {error}
        </div>
      )}

      {!loading && !error && (
        <>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            <Stat icon={FileCheck} label="Standards Served" value={total.toLocaleString()} sub={`API status: ${health?.status ?? 'unknown'} · ${enriched} enriched dossiers`} tone="blue" />
            <Stat icon={Layers} label="Divisions Covered" value={divisions.length} sub={`${divisions.slice(0, 4).map((d) => d.division).join(', ') || '—'}${divisions.length > 4 ? ` +${divisions.length - 4} more` : ''}`} tone="indigo" />
            <Stat icon={ShieldCheck} label="Mandatory QCO Exposure" value={qco.toLocaleString()} sub="standards requiring certification" tone="amber" />
            <Stat icon={AlertTriangle} label="Outdated Citations Risk" value={outdated.toLocaleString()} sub="superseded / withdrawn in corpus" tone="red" />
          </div>

          <div className="bg-amber-50/60 border border-amber-200 rounded-xl p-4 text-xs text-amber-900">
            <strong>Coverage honesty note:</strong> metrics above describe the unified corpus
            ({total.toLocaleString()} records: {enriched} enriched dossiers + national catalogue).
            Live pipeline run metrics (ingestion_runs) wire in with the Postgres backend — see{' '}
            <Link href="/analytics" className="underline font-semibold">Corpus Analytics</Link> for
            the full division breakdown.
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            <SectionCard
              title={`Low-Confidence Review Queue (${reviews.length})`}
              subtitle="Uncertain ingestion rows awaiting human review. Approve/reject runs in the pipeline review workflow."
            >
              {reviewNotice && (
                <p className="rounded-lg border border-slate-200 bg-slate-50 p-3 text-xs text-slate-500">{reviewNotice}</p>
              )}
              {!reviewNotice && reviews.length === 0 && (
                <p className="rounded-lg border border-emerald-200 bg-emerald-50 p-3 text-xs text-emerald-800">
                  Queue is clear — no pending low-confidence rows.
                </p>
              )}
              {reviews.length > 0 && (
                <ul className="max-h-56 space-y-1.5 overflow-y-auto scroll-slim">
                  {reviews.map((r) => (
                    <li key={r.id} className="flex items-center justify-between gap-2 rounded-lg border border-slate-100 bg-slate-50/60 px-3 py-2 text-xs">
                      <span className="font-mono font-bold text-govNavy-900">{r.canonical_key || r.id.slice(0, 8)}</span>
                      <span className="flex-1 truncate text-slate-500">{r.reason}</span>
                      <span className="text-[11px] tabular-nums text-slate-400">
                        {r.confidence != null ? Number(r.confidence).toFixed(2) : '—'}
                      </span>
                    </li>
                  ))}
                </ul>
              )}
            </SectionCard>

            <SectionCard
              title={`Manual Corrections Outbox (${correctionCount})`}
              subtitle="Reviewer-suggested fixes queued on this device. Nothing auto-applies."
              action={
                correctionCount > 0 ? (
                  <span className="flex gap-1.5">
                    <button type="button" onClick={() => { exportCorrections(); }} className="btn-secondary">
                      Export JSON
                    </button>
                    <button
                      type="button"
                      onClick={() => { clearCorrections(); setCorrectionCount(0); }}
                      className="btn-secondary"
                    >
                      Clear
                    </button>
                  </span>
                ) : undefined
              }
            >
              {correctionCount === 0 ? (
                <p className="rounded-lg border border-slate-200 bg-slate-50 p-3 text-xs text-slate-500">
                  Empty. Suggest corrections from any standard dossier — they queue here for admin ingestion.
                </p>
              ) : (
                <ul className="max-h-56 space-y-1.5 overflow-y-auto scroll-slim">
                  {getCorrections().map((c) => (
                    <li key={c.id} className="rounded-lg border border-slate-100 bg-slate-50/60 px-3 py-2 text-xs">
                      <span className="font-mono font-bold text-govNavy-900">{c.is_number}</span>
                      <span className="ml-2 rounded bg-slate-200/70 px-1.5 py-0.5 text-[10px] font-semibold text-slate-600">{c.field}</span>
                      <p className="mt-1 break-words text-slate-600">{c.message}</p>
                    </li>
                  ))}
                </ul>
              )}
            </SectionCard>
          </div>
        </>
      )}
    </div>
  );
}
