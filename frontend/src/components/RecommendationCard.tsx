'use client';

import React, { useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import {
  AlertTriangle,
  CheckCircle2,
  XCircle,
  HelpCircle,
  ShieldCheck,
  ChevronDown,
  ChevronUp,
  FileText,
  Copy,
  Check,
  ThumbsUp,
  ThumbsDown,
  Building2,
  Sparkles,
  ExternalLink,
  Info,
  Loader2,
} from 'lucide-react';
import { Recommendation, AlliedItem, SummaryResponse } from '@/lib/types';

import VoicePlayer from './VoicePlayer';
import { submitFeedback, getStandardDetailUrl, summarizeStandard } from '@/lib/api';

const ROLE_DOT: Record<string, string> = {
  'Test method': 'fill-emerald-500',
  Safety: 'fill-red-500',
  Installation: 'fill-amber-500',
  Terminology: 'fill-violet-500',
  Sampling: 'fill-cyan-500',
  Dimensions: 'fill-orange-500',
};

/** Plain-words explanation of the retrieval signals behind a recommendation. */
function describeMatch(rec: Recommendation): string {
  const dense = rec.signals?.dense_rank;
  const sparse = rec.signals?.sparse_rank;
  if (dense != null && sparse != null) {
    return `Confirmed by both keyword and semantic search (keyword #${sparse} · semantic #${dense}) — the strongest agreement signal.`;
  }
  if (dense != null) {
    return `Matched by semantic similarity (semantic #${dense}); no exact keyword hit — review the scope before citing.`;
  }
  if (sparse != null) {
    return `Matched by keyword overlap (keyword #${sparse}); semantic similarity is weak — verify applicability.`;
  }
  return 'Ranked by overall relevance across the corpus.';
}

function shortId(isNumber: string): string {
  const parts = isNumber.split(' ');
  return parts.length > 1 ? parts.slice(1).join(' ') : isNumber;
}

/** Radial allied-standards network: center standard, satellites colored by role. */
function AlliedNetwork({ center, groups }: { center: string; groups: [string, AlliedItem[]][] }) {
  const router = useRouter();
  const items = groups.flatMap(([role, list]) => (list || []).slice(0, 6).map((it) => ({ ...it, group: role }))).slice(0, 12);
  const cx = 280;
  const cy = 128;
  const radius = 92;
  return (
    <div>
      <svg viewBox="0 0 560 256" className="h-auto w-full" role="img" aria-label={`Allied network for ${center}`}>
        {items.map((it, i) => {
          const angle = (i / Math.max(items.length, 1)) * Math.PI * 2 - Math.PI / 2;
          const x = cx + radius * Math.cos(angle);
          const y = cy + radius * Math.sin(angle);
          const dot = ROLE_DOT[it.group] || 'fill-slate-400';
          return (
            <g key={it.is_number}>
              <line x1={cx} y1={cy} x2={x} y2={y} stroke="#e2e8f0" strokeWidth={1.5} strokeDasharray={it.hop && it.hop > 1 ? '4 3' : undefined} />
              <g
                className="cursor-pointer"
                onClick={() => router.push(getStandardDetailUrl(it.is_number))}
              >
                <circle cx={x} cy={y} r={17} className={`${dot} opacity-90`} />
                <text x={x} y={y + 3.5} textAnchor="middle" fontSize={8.5} fontWeight={700} fill="#fff" fontFamily="monospace">
                  {shortId(it.is_number).slice(0, 9)}
                </text>
                <text x={x} y={y + 28} textAnchor="middle" fontSize={8.5} fill="#475569" fontFamily="monospace">
                  {it.is_number.length > 14 ? `${it.is_number.slice(0, 13)}…` : it.is_number}
                </text>
              </g>
            </g>
          );
        })}
        <circle cx={cx} cy={cy} r={26} className="fill-govNavy-900" />
        <text x={cx} y={cy + 4} textAnchor="middle" fontSize={10} fontWeight={800} fill="#fff" fontFamily="monospace">
          {shortId(center).slice(0, 10)}
        </text>
      </svg>
      <div className="mt-1 flex flex-wrap gap-x-3 gap-y-1">
        {groups.map(([role, list]) => (
          <span key={role} className="inline-flex items-center gap-1 text-[11px] text-slate-500">
            <span className={`h-2 w-2 rounded-full ${ROLE_DOT[role] || 'fill-slate-400'}`} />
            {role} ({(list || []).length})
          </span>
        ))}
      </div>
    </div>
  );
}

interface RecommendationCardProps {
  rec: Recommendation;
  query: string;
}

export default function RecommendationCard({ rec, query }: RecommendationCardProps) {
  const [showClause, setShowClause] = useState(false);
  const [showAllied, setShowAllied] = useState(false);
  const [showSummary, setShowSummary] = useState(false);
  const [summary, setSummary] = useState<SummaryResponse | null>(null);
  const [summaryLoading, setSummaryLoading] = useState(false);
  const [summaryError, setSummaryError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [feedbackSent, setFeedbackSent] = useState<'positive' | 'negative' | null>(null);

  const toggleSummary = async () => {
    const next = !showSummary;
    setShowSummary(next);
    if (next && !summary && !summaryLoading) {
      setSummaryLoading(true);
      setSummaryError(null);
      try {
        setSummary(await summarizeStandard(rec.is_number, query));
      } catch (err: any) {
        setSummaryError(err.message || 'Summary unavailable.');
      } finally {
        setSummaryLoading(false);
      }
    }
  };

  const status = rec.status.toLowerCase();
  const isSuperseded = status === 'superseded' || status === 'withdrawn';

  const copyClause = () => {
    if (rec.tender_clause) {
      navigator.clipboard.writeText(rec.tender_clause);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  };

  const handleFeedback = (verdict: 'relevant' | 'irrelevant') => {
    submitFeedback(rec.is_number, verdict, query);
    setFeedbackSent(verdict === 'relevant' ? 'positive' : 'negative');
  };

  // Status Badge Metadata
  const getStatusBadge = () => {
    switch (status) {
      case 'current':
        return (
          <span className="inline-flex items-center gap-1 bg-emerald-50 text-emerald-700 border border-emerald-300 px-2.5 py-0.5 rounded text-xs font-semibold">
            <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600" />
            Current Standard
          </span>
        );
      case 'superseded':
        return (
          <span className="inline-flex items-center gap-1 bg-red-50 text-red-700 border border-red-300 px-2.5 py-0.5 rounded text-xs font-semibold">
            <AlertTriangle className="w-3.5 h-3.5 text-red-600" />
            Superseded
          </span>
        );
      case 'withdrawn':
        return (
          <span className="inline-flex items-center gap-1 bg-rose-50 text-rose-700 border border-rose-300 px-2.5 py-0.5 rounded text-xs font-semibold">
            <XCircle className="w-3.5 h-3.5 text-rose-600" />
            Withdrawn
          </span>
        );
      default:
        return (
          <span className="inline-flex items-center gap-1 bg-amber-50 text-amber-700 border border-amber-300 px-2.5 py-0.5 rounded text-xs font-semibold">
            <HelpCircle className="w-3.5 h-3.5 text-amber-600" />
            {rec.status}
          </span>
        );
    }
  };

  const isEnriched = rec.tier === 'enriched' || rec.is_enriched === true;

  // Tier Badge Metadata
  const getTierBadge = () => {
    if (isEnriched) {
      return (
        <span
          title="Seed Enriched Dossier: includes scope, normative references, certification, amendments, and allied relationships"
          className="inline-flex items-center gap-1.5 bg-blue-50 text-blue-800 border border-blue-200 px-2.5 py-0.5 rounded text-xs font-semibold"
        >
          <Sparkles className="w-3.5 h-3.5 text-blue-600 shrink-0" />
          <span>Seed Enriched Dossier</span>
        </span>
      );
    }
    return (
      <span
        title="Official BIS Catalogue: national published standard with official catalogue metadata"
        className="inline-flex items-center gap-1.5 bg-slate-100 text-slate-800 border border-slate-300 px-2.5 py-0.5 rounded text-xs font-semibold"
      >
        <Building2 className="w-3.5 h-3.5 text-slate-600 shrink-0" />
        <span>Official BIS Catalogue</span>
      </span>
    );
  };

  const getRoleIcon = (r: string) => {
    switch (r.toLowerCase()) {
      case 'test method':
        return '🧪';
      case 'safety':
        return '🛡️';
      case 'installation':
        return '🔧';
      case 'terminology':
        return '📖';
      case 'sampling':
        return '📊';
      case 'dimensions':
        return '📏';
      default:
        return '📦';
    }
  };

  const alliedRoles = rec.allied ? Object.entries(rec.allied) : [];
  const totalAlliedCount = alliedRoles.reduce((acc, [_, items]) => acc + items.length, 0);

  return (
    <div className="bg-white border border-slate-200 rounded-xl p-5 shadow-sm hover:border-slate-300 transition-all">
      {/* Top Row: IS Number, Version & Confidence Badge */}
      <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-3 border-b border-slate-100 pb-3">
        <div>
          <div className="flex items-center gap-2.5 flex-wrap">
            <Link
              href={getStandardDetailUrl(rec.is_number)}
              className="text-xl font-bold text-govNavy-900 hover:text-blue-700 tracking-tight transition-colors inline-flex items-center gap-1.5"
            >
              <span>{rec.is_number}</span>
              <ExternalLink className="w-3.5 h-3.5 opacity-40 hover:opacity-100" />
            </Link>
            <span className="text-xs bg-slate-100 text-slate-700 border border-slate-200 px-2 py-0.5 rounded font-mono font-medium">
              Edition: {rec.latest_version}
            </span>
            {getTierBadge()}
            {getStatusBadge()}
            {rec.superseded_by && (
              <span className="inline-flex items-center gap-1 bg-red-100 text-red-800 border border-red-200 px-2 py-0.5 rounded text-xs font-bold">
                Replaced by {rec.superseded_by}
              </span>
            )}
          </div>
          <h4 className="text-base font-semibold text-blue-900 mt-1.5">
            <Link
              href={getStandardDetailUrl(rec.is_number)}
              className="hover:underline"
            >
              {rec.title}
            </Link>
          </h4>
          {rec.title_hindi && (
            <div className="text-xs text-slate-500 font-medium mt-0.5">
              {rec.title_hindi}
            </div>
          )}

          {/* Catalogue Metadata Chips for Tier 2 */}
          {!isEnriched && (
            <div className="mt-2 flex items-center gap-2 flex-wrap text-xs text-slate-600">
              {(rec.department_name || rec.department) && (
                <span className="bg-slate-50 border border-slate-200 px-2 py-0.5 rounded">
                  <strong>Department:</strong> {rec.department_name || rec.department}
                </span>
              )}
              {rec.aspect && (
                <span className="bg-slate-50 border border-slate-200 px-2 py-0.5 rounded">
                  <strong>Aspect:</strong> {rec.aspect}
                </span>
              )}
              {rec.published_on && (
                <span className="bg-slate-50 border border-slate-200 px-2 py-0.5 rounded">
                  <strong>Published:</strong> {rec.published_on}
                </span>
              )}
              {rec.valid_upto && (
                <span className="bg-slate-50 border border-slate-200 px-2 py-0.5 rounded">
                  <strong>Valid Upto:</strong> {rec.valid_upto}
                </span>
              )}
            </div>
          )}

          {/* Amendments UI (surfaced only when verified amendments exist) */}
          {rec.amendments && rec.amendments.length > 0 && (
            <div className="mt-2 flex items-center gap-1.5 flex-wrap text-xs">
              <span className="text-slate-600 font-semibold flex items-center gap-1">
                <span>📜 Gazette Amendments ({rec.amendments.length}):</span>
              </span>
              {rec.amendments.map((amdt) => (
                <span
                  key={amdt.number}
                  className="inline-flex items-center bg-blue-50 text-blue-800 border border-blue-200 px-2 py-0.5 rounded text-[11px] font-mono font-medium"
                >
                  Amdt {amdt.number} {amdt.date ? `(${amdt.date})` : ''}
                </span>
              ))}
            </div>
          )}
        </div>


        <div className="text-left sm:text-right shrink-0">
          <div className="inline-flex items-center gap-1.5 font-bold text-sm">
            <span
              className={`w-2.5 h-2.5 rounded-full ${
                rec.band === 'High' ? 'bg-emerald-500' : rec.band === 'Medium' ? 'bg-amber-500' : 'bg-red-500'
              }`}
            />
            <span
              className={
                rec.band === 'High'
                  ? 'text-emerald-700'
                  : rec.band === 'Medium'
                  ? 'text-amber-700'
                  : 'text-red-700'
              }
            >
              {rec.band} Confidence
            </span>
          </div>
          <div className="text-xs text-slate-500 mt-0.5">Score: {rec.confidence.toFixed(3)}</div>
        </div>
      </div>

      {/* Superseded Critical Banner */}
      {rec.superseded_by && (
        <div className="mt-3 bg-red-50 border-l-4 border-red-600 p-3 rounded-r text-xs sm:text-sm text-red-900">
          <p className="font-bold flex items-center gap-1.5 text-red-800">
            <AlertTriangle className="w-4 h-4 text-red-600 shrink-0" />
            CRITICAL CURRENCY WARNING: Outdated Citation
          </p>
          <p className="mt-1 text-slate-700 leading-relaxed">
            This standard is <strong>{rec.status.toUpperCase()}</strong> and was consolidated into{' '}
            <strong className="text-red-800 underline">{rec.superseded_by}</strong>. Citing this standard in active
            public procurement will cause legal disqualifications and bidder disputes.
          </p>
        </div>
      )}

      {/* Scope / Catalogue Justification Callout */}
      {rec.justification && (
        <div className="mt-3 bg-slate-50 border-l-4 border-blue-600 p-3 rounded-r text-xs sm:text-sm text-slate-800">
          <p className="font-semibold text-blue-900 flex items-center gap-1.5">
            <span>💡 {isEnriched ? 'Scope Justification:' : 'Catalogue Match Evidence:'}</span>
          </p>
          <p className="mt-0.5 text-slate-700 leading-relaxed">{rec.justification}</p>
        </div>
      )}

      {/* Match overview + AI summary */}
      <div className="mt-3 rounded-lg border border-slate-200 bg-white overflow-hidden">
        <div className="flex items-center gap-2 px-3.5 py-2.5 bg-slate-50/70 text-xs text-slate-600">
          <Info className="h-3.5 w-3.5 shrink-0 text-blue-600" aria-hidden />
          <span><strong className="font-semibold text-slate-700">Match overview:</strong> {describeMatch(rec)}</span>
        </div>
        <button
          type="button"
          onClick={toggleSummary}
          className="flex w-full items-center justify-between px-3.5 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-50 transition-colors border-t border-slate-100"
        >
          <span className="flex items-center gap-1.5">
            <Sparkles className="h-3.5 w-3.5 text-govSaffron-500" aria-hidden />
            AI summary — quoted from the published scope
          </span>
          {showSummary ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
        </button>
        {showSummary && (
          <div className="border-t border-slate-100 bg-white px-3.5 py-3 text-xs sm:text-sm">
            {summaryLoading && (
              <p className="flex items-center gap-2 text-slate-500">
                <Loader2 className="h-4 w-4 animate-spin text-blue-600" /> Summarizing scope…
              </p>
            )}
            {summaryError && <p className="text-red-700">⚠️ {summaryError}</p>}
            {summary && !summaryLoading && (
              <div className="space-y-2">
                {summary.notice && (
                  <p className="rounded-md bg-slate-50 border border-slate-200 p-2.5 text-slate-600">{summary.notice}</p>
                )}
                {summary.summary.map((s, i) => (
                  <p key={i} className="border-l-2 border-govSaffron-500 pl-2.5 leading-relaxed text-slate-700">
                    “{s}”
                  </p>
                ))}
                {summary.facts.length > 0 && (
                  <ul className="space-y-1 pt-1">
                    {summary.facts.map((f, i) => (
                      <li key={i} className="flex gap-1.5 text-slate-600">
                        <Check className="h-3.5 w-3.5 shrink-0 text-emerald-600 mt-0.5" aria-hidden />
                        <span>{f}</span>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            )}
          </div>
        )}
      </div>

      {/* Tier 2 Catalogue Notice */}
      {!isEnriched && (
        <div className="mt-3 bg-slate-50/80 border border-slate-200 p-3 rounded-lg text-xs text-slate-700 flex items-start gap-2.5">
          <Info className="w-4 h-4 text-slate-500 shrink-0 mt-0.5" />
          <div>
            <p className="font-semibold text-slate-800">
              Catalogue metadata available. Detailed compliance dossier is not currently available for this standard.
            </p>
            <p className="text-slate-500 mt-0.5 text-[11px] leading-relaxed">
              Standard conformity verification and legally enforceable NIT tender clause are pre-formulated below based on official BIS records.
            </p>
          </div>
        </div>
      )}


      {/* Granular Mandatory Certification Callout (ISI / CRS / Hallmarking) */}
      {rec.certification && (rec.certification.mandatory || rec.certification.scheme) && (() => {
        const scheme = (rec.certification.scheme || 'ISI').toUpperCase();
        const product = rec.certification.product || 'this item';
        if (scheme === 'CRS') {
          return (
            <div className="mt-3 bg-indigo-50 border border-indigo-200 p-3 rounded-lg text-xs sm:text-sm text-indigo-950 flex items-start gap-2.5">
              <ShieldCheck className="w-5 h-5 text-indigo-600 shrink-0 mt-0.5" />
              <div>
                <span className="font-bold text-indigo-900 flex items-center gap-2">
                  <span>MANDATORY BIS REGISTRATION (CRS SCHEME-II)</span>
                  <span className="text-[10px] bg-indigo-100 text-indigo-800 px-1.5 py-0.5 rounded font-semibold uppercase">
                    Compulsory Registration
                  </span>
                </span>
                <p className="text-indigo-800 mt-0.5 text-xs leading-relaxed">
                  Bidders <strong>must hold a valid BIS Registration Number (R-number)</strong> for {product}.
                  Products must bear the standard BIS Self-Declaration mark in compliance with Scheme-II of BIS (Conformity Assessment) Regulations.
                </p>
              </div>
            </div>
          );
        } else if (scheme === 'HALLMARKING') {
          return (
            <div className="mt-3 bg-amber-50 border border-amber-300 p-3 rounded-lg text-xs sm:text-sm text-amber-950 flex items-start gap-2.5">
              <ShieldCheck className="w-5 h-5 text-amber-600 shrink-0 mt-0.5" />
              <div>
                <span className="font-bold text-amber-900 flex items-center gap-2">
                  <span>MANDATORY BIS HALLMARKING & HUID</span>
                  <span className="text-[10px] bg-amber-100 text-amber-800 px-1.5 py-0.5 rounded font-semibold uppercase">
                    Precious Articles
                  </span>
                </span>
                <p className="text-amber-800 mt-0.5 text-xs leading-relaxed">
                  Supplied articles ({product}) <strong>must bear mandatory BIS Hallmarking</strong> with a 6-digit alphanumeric
                  Hallmarking Unique Identification (HUID) and certified fineness grade under BIS (Hallmarking) Regulations.
                </p>
              </div>
            </div>
          );
        } else {
          return (
            <div className="mt-3 bg-amber-50 border border-amber-200 p-3 rounded-lg text-xs sm:text-sm text-amber-900 flex items-start gap-2.5">
              <ShieldCheck className="w-5 h-5 text-amber-600 shrink-0 mt-0.5" />
              <div>
                <span className="font-bold text-amber-900 flex items-center gap-2">
                  <span>MANDATORY CERTIFICATION: {rec.certification.scheme_label || 'BIS Product Certification (ISI Mark)'}</span>
                  <span className="text-[10px] bg-amber-100 text-amber-800 px-1.5 py-0.5 rounded font-semibold uppercase">
                    Gazette QCO
                  </span>
                </span>
                <p className="text-amber-800 mt-0.5 text-xs leading-relaxed">
                  Bidders <strong>must hold an active BIS CM/L license</strong> to affix the ISI mark for {product}.
                  Supplying uncertified goods is legally prohibited under the Gazette Quality Control Order (QCO).
                </p>
              </div>
            </div>
          );
        }
      })()}

      {/* Allied Standards & Normative References */}
      {totalAlliedCount > 0 && (
        <div className="mt-3 border border-slate-200 rounded-lg overflow-hidden">
          <button
            type="button"
            onClick={() => setShowAllied(!showAllied)}
            className="w-full flex items-center justify-between px-3.5 py-2.5 bg-slate-50 hover:bg-slate-100 text-xs font-semibold text-slate-700 transition-colors"
          >
            <span>📚 Allied Standards & Normative References ({totalAlliedCount} identified)</span>
            {showAllied ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
          </button>

          {showAllied && (
            <div className="p-3.5 bg-white border-t border-slate-200 grid grid-cols-1 md:grid-cols-2 gap-4 text-xs">
              <div className="md:col-span-2 rounded-lg border border-slate-100 bg-slate-50/60 p-3">
                <p className="mb-1 text-[11px] font-bold uppercase tracking-wider text-slate-400">
                  Allied network — click any node for its dossier
                </p>
                <AlliedNetwork center={rec.is_number} groups={alliedRoles} />
              </div>
              {alliedRoles.map(([role, items]) => (
                <div key={role} className="border border-slate-100 rounded-md p-2.5 bg-slate-50/50">
                  <h5 className="font-bold text-slate-800 mb-1.5 flex items-center justify-between">
                    <span className="flex items-center gap-1.5">
                      <span>{getRoleIcon(role)}</span>
                      <span>{role}</span>
                    </span>
                    <span className="text-[10px] bg-slate-200 text-slate-700 px-1.5 py-0.2 rounded font-normal">
                      {items.length}
                    </span>
                  </h5>
                  <ul className="space-y-1.5">
                    {items.slice(0, 5).map((it) => (
                      <li key={it.is_number} className="text-slate-700 flex items-baseline gap-1.5">
                        <code className="bg-white border border-slate-200 px-1 py-0.5 rounded font-mono text-[11px] font-semibold text-govNavy-800">
                          {it.is_number}
                        </code>
                        <span className="truncate flex-1" title={it.title}>
                          {it.title}
                        </span>
                        {it.hop && (
                          <span className="text-[10px] text-slate-400 shrink-0">
                            hop {it.hop}{it.relevance != null ? ` · rel ${it.relevance}` : ''}
                          </span>
                        )}
                      </li>
                    ))}
                  </ul>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Tender Clause Generator & Actions */}
      <div className="mt-4 pt-3 border-t border-slate-100 flex flex-wrap items-center justify-between gap-3 text-xs">
        <div className="flex items-center gap-2 flex-wrap">
          <button
            type="button"
            onClick={() => setShowClause(!showClause)}
            className="flex items-center gap-1.5 bg-slate-100 hover:bg-slate-200 text-slate-800 font-semibold px-3 py-1.5 rounded text-xs border border-slate-300 transition-colors"
          >
            <FileText className="w-3.5 h-3.5 text-blue-700" />
            {showClause ? 'Hide Tender Clause' : '📝 View Formatted Tender Clause'}
          </button>

          <Link
            href={getStandardDetailUrl(rec.is_number)}
            className="flex items-center gap-1.5 bg-blue-50 hover:bg-blue-100 text-blue-800 font-semibold px-3 py-1.5 rounded text-xs border border-blue-200 transition-colors"
          >
            <ExternalLink className="w-3.5 h-3.5 text-blue-700" />
            <span>{isEnriched ? 'View Enriched Dossier' : 'View Catalogue Metadata'}</span>
          </Link>
        </div>


        {/* Feedback Buttons */}
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => handleFeedback('relevant')}
            disabled={feedbackSent !== null}
            className={`flex items-center gap-1 px-2.5 py-1 rounded border text-xs font-medium transition-colors ${
              feedbackSent === 'positive'
                ? 'bg-emerald-50 text-emerald-700 border-emerald-300 font-semibold'
                : 'bg-white hover:bg-slate-50 text-slate-600 border-slate-200'
            }`}
          >
            <ThumbsUp className="w-3 h-3 text-emerald-600" />
            <span>{feedbackSent === 'positive' ? 'Feedback Saved' : 'Relevant'}</span>
          </button>

          <button
            type="button"
            onClick={() => handleFeedback('irrelevant')}
            disabled={feedbackSent !== null}
            className={`flex items-center gap-1 px-2.5 py-1 rounded border text-xs font-medium transition-colors ${
              feedbackSent === 'negative'
                ? 'bg-red-50 text-red-700 border-red-300 font-semibold'
                : 'bg-white hover:bg-slate-50 text-slate-600 border-slate-200'
            }`}
          >
            <ThumbsDown className="w-3 h-3 text-red-600" />
            <span>{feedbackSent === 'negative' ? 'Recorded' : 'Irrelevant'}</span>
          </button>
        </div>
      </div>

      {/* Formatted Tender Clause Box */}
      {showClause && rec.tender_clause && (
        <div className="mt-3 bg-emerald-50/70 border border-emerald-200 rounded-lg p-3 text-xs">
          <div className="flex items-center justify-between pb-2 border-b border-emerald-200/60 mb-2">
            <span className="font-bold text-emerald-900">NIT / RFP Enforceable Clause:</span>
            <button
              type="button"
              onClick={copyClause}
              className="flex items-center gap-1 bg-white hover:bg-emerald-100 border border-emerald-300 text-emerald-800 px-2 py-0.5 rounded font-semibold transition-colors"
            >
              {copied ? <Check className="w-3 h-3 text-emerald-600" /> : <Copy className="w-3 h-3" />}
              {copied ? 'Copied!' : 'Copy to Clipboard'}
            </button>
          </div>
          <pre className="whitespace-pre-wrap font-mono text-[11px] text-emerald-950 leading-relaxed bg-white/70 p-2.5 rounded border border-emerald-200/50">
            {rec.tender_clause}
          </pre>
        </div>
      )}

      {/* Evidence & source traceability (all values served by the retrieval payload) */}
      <div className="mt-3 flex items-center gap-2 flex-wrap text-[11px] text-slate-500">
        <span className="font-semibold text-slate-600">Evidence:</span>
        {rec.canonical_key && (
          <span className="bg-slate-50 border border-slate-200 px-1.5 py-0.5 rounded font-mono">
            key {rec.canonical_key}
          </span>
        )}
        {rec.department && (
          <span className="bg-slate-50 border border-slate-200 px-1.5 py-0.5 rounded">
            dept {rec.department}
          </span>
        )}
        {rec.signals && (rec.signals.dense_rank != null || rec.signals.sparse_rank != null) && (
          <span className="bg-slate-50 border border-slate-200 px-1.5 py-0.5 rounded font-mono">
            dense#{rec.signals.dense_rank ?? '–'} sparse#{rec.signals.sparse_rank ?? '–'}
          </span>
        )}
        <Link
          href={getStandardDetailUrl(rec.is_number)}
          className="text-blue-700 hover:underline font-medium"
        >
          verify in dossier →
        </Link>
      </div>

      {/* Multilingual Voice Explanation (Sarvam AI TTS) */}
      <VoicePlayer
        isNumber={rec.is_number}
        title={rec.title}
        status={rec.status}
        justification={rec.justification}
        supersededBy={rec.superseded_by}
      />
    </div>
  );
}
