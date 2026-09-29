'use client';

import React, { useEffect, useMemo, useRef, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import {
  Search,
  Database,
  Activity,
  Layers,
  Sparkles,
  ShieldCheck,
  AlertTriangle,
  FileSearch,
  History,
  ArrowRight,
  Loader2,
  FlaskConical,
  ClipboardCheck,
} from 'lucide-react';
import {
  fetchDivisions,
  recommendStandards,
  validateSpecification,
  getStandardDetailUrl,
} from '@/lib/api';
import { getHistory } from '@/lib/history';
import { useLanguage } from '@/lib/i18n';
import type { DivisionsResponse } from '@/lib/types';

const ASPECT_COLORS = [
  'bg-blue-500',
  'bg-violet-500',
  'bg-fuchsia-500',
  'bg-orange-500',
  'bg-amber-400',
  'bg-emerald-500',
  'bg-cyan-400',
  'bg-indigo-400',
  'bg-purple-400',
  'bg-teal-400',
  'bg-lime-400',
  'bg-rose-500',
];

function Kpi({
  icon: Icon,
  label,
  value,
  sub,
  accent,
}: {
  icon: React.ElementType;
  label: string;
  value: string;
  sub: string;
  accent: string;
}) {
  return (
    <div className="rounded-xl border border-white/10 bg-white/[0.04] p-4 backdrop-blur-sm">
      <div className="flex items-center justify-between gap-2">
        <span className="text-xs font-medium text-slate-400">{label}</span>
        <Icon className={`h-4 w-4 ${accent}`} aria-hidden />
      </div>
      <div className="mt-1 text-[28px] font-bold tabular-nums leading-none text-white">{value}</div>
      <div className="mt-1.5 text-[11px] text-slate-500">{sub}</div>
    </div>
  );
}

function BarRow({
  label,
  value,
  max,
  color,
  sub,
}: {
  label: string;
  value: number;
  max: number;
  color: string;
  sub?: string;
}) {
  const pct = max > 0 ? Math.max(Math.round((value / max) * 100), 2) : 0;
  return (
    <div>
      <div className="flex items-baseline justify-between gap-2 text-xs">
        <span className="truncate font-medium text-slate-300" title={sub || label}>
          {label}
        </span>
        <span className="shrink-0 font-semibold tabular-nums text-slate-100">
          {value.toLocaleString()}
        </span>
      </div>
      <div className="mt-1 h-2.5 overflow-hidden rounded-full bg-white/[0.07]">
        <div className={`h-full rounded-full ${color}`} style={{ width: `${pct}%` }} />
      </div>
    </div>
  );
}

export default function DashboardPage() {
  const router = useRouter();
  const { t } = useLanguage();
  const searchRef = useRef<HTMLInputElement>(null);
  const [command, setCommand] = useState('');
  const [data, setData] = useState<DivisionsResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [quickSpec, setQuickSpec] = useState('');
  const [quickLoading, setQuickLoading] = useState(false);
  const [quickError, setQuickError] = useState<string | null>(null);
  const [quickResults, setQuickResults] = useState<
    { is_number: string; title: string; band: string; confidence: number }[] | null
  >(null);

  const [auditText, setAuditText] = useState('');
  const [auditLoading, setAuditLoading] = useState(false);
  const [auditError, setAuditError] = useState<string | null>(null);
  const [auditSummary, setAuditSummary] = useState<{
    high: number;
    medium: number;
    total: number;
    additions: number;
  } | null>(null);

  useEffect(() => {
    fetchDivisions()
      .then((res) => setData(res))
      .catch((err) => setError(err.message || 'Failed to load dashboard metrics'))
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        searchRef.current?.focus();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  const totals = useMemo(() => {
    if (!data) return { qco: 0, outdated: 0, enriched: 0, current: 0 };
    return {
      qco: data.divisions.reduce((n, d) => n + d.qco, 0),
      outdated: data.divisions.reduce((n, d) => n + d.outdated, 0),
      enriched: data.divisions.reduce((n, d) => n + d.enriched, 0),
      current: data.divisions.reduce((n, d) => n + d.current, 0),
    };
  }, [data]);

  const aspects = useMemo(() => (data?.aspects || []).slice(0, 12), [data]);
  const aspectMax = useMemo(
    () => aspects.reduce((m, a) => Math.max(m, a.total), 0),
    [aspects]
  );
  const topDivisions = useMemo(() => (data?.divisions || []).slice(0, 8), [data]);
  const divMax = useMemo(
    () => topDivisions.reduce((m, d) => Math.max(m, d.total), 0),
    [topDivisions]
  );

  const statusSlices = useMemo(() => {
    const s = data?.statuses || {};
    const total = data?.total || 1;
    const current = s.current || 0;
    const withdrawn = s.withdrawn || 0;
    const superseded = s.superseded || 0;
    const other = Math.max(total - current - withdrawn - superseded, 0);
    return { current, withdrawn, superseded, other, total };
  }, [data]);

  const donutStyle = useMemo(() => {
    const { current, withdrawn, superseded, other, total } = statusSlices;
    const p = (n: number) => ((n / total) * 100).toFixed(1);
    let acc = 0;
    const seg = (n: number, color: string) => {
      const start = (acc / total) * 360;
      acc += n;
      const end = (acc / total) * 360;
      return `${color} ${start.toFixed(1)}deg ${end.toFixed(1)}deg`;
    };
    return {
      background: `conic-gradient(${seg(current, '#10b981')}, ${seg(withdrawn, '#fb7185')}, ${seg(
        superseded,
        '#ef4444'
      )}, ${seg(other, '#f59e0b')})`,
      currentPct: p(current),
    };
  }, [statusSlices]);

  const runQuickRecommend = async () => {
    const text = quickSpec.trim();
    if (!text || quickLoading) return;
    setQuickLoading(true);
    setQuickError(null);
    try {
      const res = await recommendStandards(text, 3);
      if (!res.recommendations?.length) {
        setQuickError(res.message || 'No confident match. Add material, rating, or application detail.');
        setQuickResults([]);
      } else {
        setQuickResults(
          res.recommendations.map((r) => ({
            is_number: r.is_number,
            title: r.title,
            band: r.band,
            confidence: r.confidence,
          }))
        );
      }
    } catch (err: any) {
      setQuickError(err.message || 'Recommendation failed.');
    } finally {
      setQuickLoading(false);
    }
  };

  const runQuickAudit = async () => {
    const text = auditText.trim();
    if (!text || auditLoading) return;
    setAuditLoading(true);
    setAuditError(null);
    try {
      const res = await validateSpecification(text);
      const high = res.issues.filter((i) => i.severity === 'high').length;
      const medium = res.issues.filter((i) => i.severity === 'medium').length;
      setAuditSummary({ high, medium, total: res.issues.length, additions: res.suggested_additions.length });
    } catch (err: any) {
      setAuditError(err.message || 'Audit failed.');
    } finally {
      setAuditLoading(false);
    }
  };

  const recent = useMemo(() => getHistory().slice(0, 6), []);
  const searchesLogged = useMemo(
    () => getHistory().filter((e) => e.kind === 'query').length,
    []
  );

  return (
    <div className="overflow-hidden rounded-2xl bg-slate-950 text-slate-100 shadow-xl ring-1 ring-slate-900">
      {/* Command bar */}
      <div className="border-b border-white/10 bg-white/[0.02] px-4 py-3 sm:px-5">
        <div className="flex items-center gap-3">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-2.5 h-4 w-4 text-slate-500" aria-hidden />
            <input
              ref={searchRef}
              type="text"
              value={command}
              onChange={(e) => setCommand(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && command.trim()) {
                  router.push(`/?q=${encodeURIComponent(command.trim())}`);
                }
              }}
              placeholder={t('dash.commandPh')}
              className="w-full rounded-lg border border-white/10 bg-white/[0.05] py-2 pl-9 pr-16 text-sm text-slate-100 placeholder:text-slate-500 focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
            />
            <kbd className="absolute right-3 top-2 rounded border border-white/10 bg-white/[0.06] px-1.5 py-0.5 font-mono text-[10px] text-slate-400">
              Ctrl K
            </kbd>
          </div>
          <span className="hidden items-center gap-1.5 whitespace-nowrap text-[11px] text-slate-400 sm:flex">
            <span className="relative flex h-2 w-2">
              <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-400 opacity-75"></span>
              <span className="relative inline-flex h-2 w-2 rounded-full bg-emerald-500"></span>
            </span>
            {t('dash.live')}
          </span>
        </div>
      </div>

      <div className="space-y-4 px-4 py-4 sm:px-5 sm:py-5">
        {loading && (
          <div className="flex h-64 items-center justify-center gap-2 text-sm text-slate-400">
            <Loader2 className="h-5 w-5 animate-spin text-blue-400" />
            <span>Loading command dashboard…</span>
          </div>
        )}

        {error && (
          <div className="rounded-xl border border-red-500/30 bg-red-500/10 p-4 text-sm text-red-200">
            ⚠️ {error}
          </div>
        )}

        {!loading && !error && data && (
          <>
            {/* KPI row */}
            <div className="grid grid-cols-2 gap-3 xl:grid-cols-6">
              <Kpi icon={Database} label={t('dash.kTotal')} value={data.total.toLocaleString()} sub={t('dash.kTotalSub')} accent="text-blue-400" />
              <Kpi icon={Activity} label={t('dash.kActive')} value={totals.current.toLocaleString()} sub={t('dash.kActiveSub')} accent="text-emerald-400" />
              <Kpi icon={Layers} label={t('dash.kAspects')} value={String(aspects.length)} sub={t('dash.kAspectsSub')} accent="text-cyan-400" />
              <Kpi icon={Sparkles} label={t('dash.kEnriched')} value={totals.enriched.toLocaleString()} sub={t('dash.kEnrichedSub')} accent="text-violet-400" />
              <Kpi icon={ShieldCheck} label={t('dash.kQco')} value={totals.qco.toLocaleString()} sub={t('dash.kQcoSub')} accent="text-amber-400" />
              <Kpi icon={AlertTriangle} label={t('dash.kOutdated')} value={totals.outdated.toLocaleString()} sub={t('dash.kOutdatedSub')} accent="text-rose-400" />
            </div>

            {/* Aspect coverage + quick actions */}
            <div className="grid grid-cols-1 gap-4 xl:grid-cols-3">
              <div className="rounded-xl border border-white/10 bg-white/[0.03] p-5 xl:col-span-2">
                <div className="mb-4 flex items-center justify-between">
                  <h3 className="text-sm font-bold text-white">{t('dash.aspectTitle')}</h3>
                  <span className="text-[10px] font-bold uppercase tracking-[0.15em] text-slate-500">
                    {t('dash.standards')}
                  </span>
                </div>
                {aspects.length === 0 ? (
                  <p className="py-8 text-center text-xs text-slate-500">
                    {t('dash.noAspect')}
                  </p>
                ) : (
                  <div className="grid grid-cols-1 gap-x-8 gap-y-3 md:grid-cols-2">
                    {aspects.map((a, i) => (
                      <BarRow
                        key={a.aspect}
                        label={a.aspect === 'unknown' ? 'Unclassified' : a.aspect}
                        value={a.total}
                        max={aspectMax}
                        color={ASPECT_COLORS[i % ASPECT_COLORS.length]}
                      />
                    ))}
                  </div>
                )}
              </div>

              <div className="flex flex-col gap-4">
                {/* Quick Recommendation */}
                <div className="rounded-xl border border-white/10 bg-white/[0.03] p-5">
                  <h3 className="flex items-center gap-1.5 text-sm font-bold text-white">
                    <Sparkles className="h-4 w-4 text-blue-400" aria-hidden />
                    {t('dash.quickRec')}
                  </h3>
                  <p className="mt-0.5 text-[11px] text-slate-400">
                    {t('dash.quickRecSub')}
                  </p>
                  <textarea
                    value={quickSpec}
                    onChange={(e) => setQuickSpec(e.target.value)}
                    rows={3}
                    placeholder={t('dash.quickRecPh')}
                    className="mt-3 w-full rounded-lg border border-white/10 bg-white/[0.05] p-2.5 text-xs text-slate-100 placeholder:text-slate-500 focus:border-blue-500 focus:outline-none"
                  />
                  <div className="mt-2 flex items-center justify-between gap-2">
                    <button
                      type="button"
                      onClick={runQuickRecommend}
                      disabled={quickLoading || !quickSpec.trim()}
                      className="inline-flex items-center gap-1.5 rounded-lg bg-blue-600 px-4 py-2 text-xs font-semibold text-white hover:bg-blue-500 disabled:opacity-50"
                    >
                      {quickLoading ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : null}
                      <span>{t('dash.recommend')}</span>
                      <ArrowRight className="h-3.5 w-3.5" aria-hidden />
                    </button>
                    {quickSpec.trim() && (
                      <Link
                        href={`/?q=${encodeURIComponent(quickSpec.trim())}`}
                        className="text-[11px] font-semibold text-blue-400 hover:underline"
                      >
                        {t('dash.fullResults')}
                      </Link>
                    )}
                  </div>
                  {quickError && <p className="mt-2 text-[11px] text-amber-300">⚠️ {quickError}</p>}
                  {quickResults && quickResults.length > 0 && (
                    <div className="mt-3 space-y-1.5">
                      {quickResults.map((r) => (
                        <Link
                          key={r.is_number}
                          href={getStandardDetailUrl(r.is_number)}
                          className="flex items-center justify-between gap-2 rounded-lg border border-white/10 bg-white/[0.04] px-2.5 py-1.5 text-xs hover:border-blue-500/50"
                        >
                          <span className="font-mono font-bold text-white">{r.is_number}</span>
                          <span className="flex-1 truncate text-slate-400" title={r.title}>
                            {r.title}
                          </span>
                          <span className="shrink-0 rounded bg-blue-500/20 px-1.5 py-0.5 text-[10px] font-bold text-blue-300">
                            {r.band} {r.confidence.toFixed(2)}
                          </span>
                        </Link>
                      ))}
                    </div>
                  )}
                </div>

                {/* Quick Audit */}
                <div className="rounded-xl border border-white/10 bg-white/[0.03] p-5">
                  <h3 className="flex items-center gap-1.5 text-sm font-bold text-white">
                    <ClipboardCheck className="h-4 w-4 text-emerald-400" aria-hidden />
                    {t('dash.quickAudit')}
                  </h3>
                  <p className="mt-0.5 text-[11px] text-slate-400">
                    {t('dash.quickAuditSub')}
                  </p>
                  <textarea
                    value={auditText}
                    onChange={(e) => setAuditText(e.target.value)}
                    rows={2}
                    placeholder={t('dash.quickAuditPh')}
                    className="mt-3 w-full rounded-lg border border-white/10 bg-white/[0.05] p-2.5 text-xs text-slate-100 placeholder:text-slate-500 focus:border-emerald-500 focus:outline-none"
                  />
                  <div className="mt-2">
                    <button
                      type="button"
                      onClick={runQuickAudit}
                      disabled={auditLoading || !auditText.trim()}
                      className="inline-flex items-center gap-1.5 rounded-lg bg-emerald-600 px-4 py-2 text-xs font-semibold text-white hover:bg-emerald-500 disabled:opacity-50"
                    >
                      {auditLoading ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : null}
                      <span>{t('dash.auditClause')}</span>
                    </button>
                  </div>
                  {auditError && <p className="mt-2 text-[11px] text-amber-300">⚠️ {auditError}</p>}
                  {auditSummary && (
                    <div className="mt-3 grid grid-cols-3 gap-2 text-center">
                      <div className="rounded-lg bg-white/[0.04] p-2">
                        <div className="text-lg font-bold tabular-nums text-red-300">{auditSummary.high}</div>
                        <div className="text-[10px] text-slate-500">{t('dash.critical')}</div>
                      </div>
                      <div className="rounded-lg bg-white/[0.04] p-2">
                        <div className="text-lg font-bold tabular-nums text-amber-300">{auditSummary.medium}</div>
                        <div className="text-[10px] text-slate-500">{t('dash.warnings')}</div>
                      </div>
                      <div className="rounded-lg bg-white/[0.04] p-2">
                        <div className="text-lg font-bold tabular-nums text-blue-300">{auditSummary.additions}</div>
                        <div className="text-[10px] text-slate-500">{t('dash.toAdd')}</div>
                      </div>
                    </div>
                  )}
                  {auditSummary && (
                    <Link href="/validator" className="mt-2 inline-block text-[11px] font-semibold text-emerald-400 hover:underline">
                      Open full audit in Tender Validator →
                    </Link>
                  )}
                </div>
              </div>
            </div>

            {/* Division coverage + status ring + activity */}
            <div className="grid grid-cols-1 gap-4 xl:grid-cols-3">
              <div className="rounded-xl border border-white/10 bg-white/[0.03] p-5">
                <h3 className="mb-4 text-sm font-bold text-white">Coverage by Division</h3>
                <div className="space-y-3">
                  {topDivisions.map((d, i) => (
                    <BarRow
                      key={d.division}
                      label={d.division}
                      value={d.total}
                      max={divMax}
                      color={ASPECT_COLORS[(i + 3) % ASPECT_COLORS.length]}
                      sub={d.division}
                    />
                  ))}
                </div>
                <Link href="/analytics" className="mt-4 inline-block text-[11px] font-semibold text-blue-400 hover:underline">
                  Full division analytics →
                </Link>
              </div>

              <div className="rounded-xl border border-white/10 bg-white/[0.03] p-5">
                <h3 className="mb-4 text-sm font-bold text-white">Currency & Status</h3>
                <div className="flex items-center gap-4">
                  <div
                    className="h-28 w-28 shrink-0 rounded-full ring-8 ring-white/[0.06]"
                    style={donutStyle}
                    role="img"
                    aria-label={`${donutStyle.currentPct}% of standards currently in force`}
                  />
                  <div className="space-y-1.5 text-xs">
                    <p className="flex items-center gap-1.5 text-slate-300">
                      <span className="h-2 w-2 rounded-full bg-emerald-500"></span>
                      Current — {statusSlices.current.toLocaleString()}
                    </p>
                    <p className="flex items-center gap-1.5 text-slate-300">
                      <span className="h-2 w-2 rounded-full bg-rose-400"></span>
                      Withdrawn — {statusSlices.withdrawn.toLocaleString()}
                    </p>
                    <p className="flex items-center gap-1.5 text-slate-300">
                      <span className="h-2 w-2 rounded-full bg-red-500"></span>
                      Superseded — {statusSlices.superseded.toLocaleString()}
                    </p>
                    <p className="flex items-center gap-1.5 text-slate-300">
                      <span className="h-2 w-2 rounded-full bg-amber-400"></span>
                      Other — {statusSlices.other.toLocaleString()}
                    </p>
                  </div>
                </div>
                <p className="mt-4 rounded-lg bg-white/[0.04] p-2.5 text-[11px] leading-relaxed text-slate-400">
                  <FlaskConical className="mr-1 inline h-3.5 w-3.5 text-cyan-400" aria-hidden />
                  {donutStyle.currentPct}% of the corpus is currently in force. Cite withdrawn or
                  superseded editions only when auditing legacy tenders.
                </p>
              </div>

              <div className="rounded-xl border border-white/10 bg-white/[0.03] p-5">
                <div className="mb-3 flex items-center justify-between">
                  <h3 className="flex items-center gap-1.5 text-sm font-bold text-white">
                    <History className="h-4 w-4 text-slate-400" aria-hidden />
                    Recent Activity
                  </h3>
                  <span className="text-[11px] text-slate-500">
                    {searchesLogged} searches logged
                  </span>
                </div>
                {recent.length === 0 ? (
                  <p className="py-6 text-center text-xs text-slate-500">
                    No activity on this device yet. Run a recommendation to start the log.
                  </p>
                ) : (
                  <div className="space-y-1.5">
                    {recent.map((entry) => (
                      <div
                        key={entry.id}
                        className="flex items-center justify-between gap-2 rounded-lg bg-white/[0.03] px-2.5 py-1.5 text-xs"
                      >
                        <div className="min-w-0">
                          <span className="mr-1.5 rounded bg-white/[0.08] px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wide text-slate-300">
                            {entry.kind}
                          </span>
                          <span className="truncate text-slate-300">{entry.label}</span>
                        </div>
                        {entry.href ? (
                          <Link
                            href={entry.href}
                            className="shrink-0 font-semibold text-blue-400 hover:underline"
                          >
                            {entry.kind === 'query' ? 'Rerun' : 'Open'}
                          </Link>
                        ) : null}
                      </div>
                    ))}
                  </div>
                )}
                <div className="mt-3 flex gap-3 text-[11px] font-semibold">
                  <Link href="/history" className="text-blue-400 hover:underline">
                    Full history →
                  </Link>
                  <Link href="/browse" className="text-blue-400 hover:underline">
                    <FileSearch className="mr-0.5 inline h-3 w-3" aria-hidden />
                    Search standards
                  </Link>
                </div>
              </div>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
