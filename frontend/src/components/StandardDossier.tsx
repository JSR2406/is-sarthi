'use client';

import React, { useEffect, useState } from 'react';
import Link from 'next/link';
import {
  ArrowLeft,
  Building2,
  Sparkles,
  CheckCircle2,
  AlertTriangle,
  XCircle,
  HelpCircle,
  ShieldCheck,
  FileText,
  Copy,
  Check,
  Network,
  Info,
  Loader2,
  Calendar,
  Layers,
  BookOpen,
  ExternalLink,
  Columns,
  Download,
  Eye,
  History,
  Send,
} from 'lucide-react';
import { fetchStandardDetail, fetchCitedBy, getStandardDetailUrl } from '@/lib/api';
import { logHistory } from '@/lib/history';
import { toggleWatch, isWatched } from '@/lib/watchlist';
import { saveCorrection } from '@/lib/corrections';
import { StandardDetail, CitedByEntry } from '@/lib/types';

export default function StandardDossier({ isNumber }: { isNumber: string }) {

  const [standard, setStandard] = useState<StandardDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [citedBy, setCitedBy] = useState<CitedByEntry[]>([]);
  const [citedCount, setCitedCount] = useState(0);
  const [watched, setWatched] = useState(false);
  const [corrField, setCorrField] = useState('title');
  const [corrMsg, setCorrMsg] = useState('');
  const [corrSent, setCorrSent] = useState(false);

  useEffect(() => {
    if (!isNumber) {
      setLoading(false);
      return;
    }
    setLoading(true);
    setError(null);

    fetchStandardDetail(isNumber)
      .then((data) => {
        setStandard(data);
        try {
          logHistory('open', isNumber, data.title, getStandardDetailUrl(isNumber));
        } catch { /* history is non-critical */ }
      })
      .catch((err) => setError(err.message || `Standard '${isNumber}' not found`))
      .finally(() => setLoading(false));

    setCitedBy([]);
    setCitedCount(0);
    setCorrSent(false);
    setWatched(isNumber ? isWatched(isNumber) : false);
    if (isNumber) {
      fetchCitedBy(isNumber, 20)
        .then((res) => {
          setCitedBy(res.cited_by);
          setCitedCount(res.cited_by_count);
        })
        .catch(() => {});
    }
  }, [isNumber]);

  const copyClause = () => {
    if (standard?.tender_clause) {
      navigator.clipboard.writeText(standard.tender_clause);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  };

  const exportJson = () => {
    if (!standard) return;
    const blob = new Blob([JSON.stringify(standard, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${standard.is_number.replace(/\s+/g, '_')}_dossier.json`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const exportMarkdown = () => {
    if (!standard) return;
    const allied = standard.allied_by_role ? Object.entries(standard.allied_by_role) : [];
    const lines = [
      `# ${standard.is_number}: ${standard.title}`,
      '',
      `- Status: ${standard.status}`,
      `- Year: ${standard.year ?? '—'}`,
      `- Department: ${standard.department_name || standard.department || standard.division || '—'}`,
      `- Aspect: ${standard.aspect || '—'}`,
      `- Amendments: ${standard.amendments?.map((a) => `Amdt ${a.number}${a.date ? ` (${a.date})` : ''}`).join(', ') || 'None'}`,
      `- Certification: ${standard.certification?.scheme_label || standard.certification?.scheme || 'Voluntary'}${standard.certification?.mandatory ? ' (mandatory)' : ''}`,
      `- Superseded by: ${standard.superseded_by || '—'}`,
      '',
      '## Scope',
      standard.scope || 'Catalogue record — scope not published for this tier.',
      '',
      '## Allied standards',
      ...allied.flatMap(([role, items]) => [
        `### ${role} (${items.length})`,
        ...items.map((it) => `- ${it.is_number}: ${it.title || ''}`),
      ]),
    ];
    const blob = new Blob([lines.join('\n')], { type: 'text/markdown' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${standard.is_number.replace(/\s+/g, '_')}_dossier.md`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const isEnriched = standard?.tier === 'enriched' || standard?.is_enriched === true;
  const status = (standard?.status || 'current').toLowerCase();

  const getStatusBadge = () => {
    switch (status) {
      case 'current':
        return (
          <span className="inline-flex items-center gap-1.5 bg-emerald-50 text-emerald-700 border border-emerald-300 px-3 py-1 rounded text-xs font-semibold">
            <CheckCircle2 className="w-4 h-4 text-emerald-600" />
            Current Standard
          </span>
        );
      case 'withdrawn':
        return (
          <span className="inline-flex items-center gap-1.5 bg-rose-50 text-rose-700 border border-rose-300 px-3 py-1 rounded text-xs font-semibold">
            <XCircle className="w-4 h-4 text-rose-600" />
            Withdrawn Standard
          </span>
        );
      case 'superseded':
        return (
          <span className="inline-flex items-center gap-1.5 bg-red-50 text-red-700 border border-red-300 px-3 py-1 rounded text-xs font-semibold">
            <AlertTriangle className="w-4 h-4 text-red-600" />
            Superseded Standard
          </span>
        );
      default:
        return (
          <span className="inline-flex items-center gap-1.5 bg-amber-50 text-amber-700 border border-amber-300 px-3 py-1 rounded text-xs font-semibold">
            <HelpCircle className="w-4 h-4 text-amber-600" />
            {standard?.status}
          </span>
        );
    }
  };

  const getTierBadge = () => {
    if (isEnriched) {
      return (
        <span
          title="Seed Enriched Dossier: includes technical scope, normative references, certification, amendments, and allied relationships"
          className="inline-flex items-center gap-1.5 bg-blue-50 text-blue-800 border border-blue-200 px-3 py-1 rounded text-xs font-semibold shadow-xs"
        >
          <Sparkles className="w-4 h-4 text-blue-600 shrink-0" />
          <span>Seed Enriched Dossier</span>
        </span>
      );
    }
    return (
      <span
        title="Official BIS Catalogue: national published standard with verified BIS catalogue metadata"
        className="inline-flex items-center gap-1.5 bg-slate-100 text-slate-800 border border-slate-300 px-3 py-1 rounded text-xs font-semibold shadow-xs"
      >
        <Building2 className="w-4 h-4 text-slate-600 shrink-0" />
        <span>Official BIS Catalogue</span>
      </span>
    );
  };

  if (!isNumber) {
    return (
      <div className="space-y-4">
        <Link
          href="/"
          className="inline-flex items-center gap-2 text-sm text-blue-700 hover:text-blue-900 font-semibold"
        >
          <ArrowLeft className="w-4 h-4" />
          <span>Back to Recommendation Engine</span>
        </Link>
        <div className="bg-white border border-slate-200 text-slate-800 p-8 rounded-xl text-center space-y-3">
          <BookOpen className="w-10 h-10 text-slate-400 mx-auto" />
          <h3 className="text-base font-bold text-govNavy-900">No Standard Specified</h3>
          <p className="text-xs text-slate-500 max-w-md mx-auto">
            Please search for an Indian Standard or select one from the catalog to view its compliance dossier.
          </p>
          <Link
            href="/"
            className="inline-flex items-center gap-1.5 bg-govNavy-900 hover:bg-govNavy-800 text-white px-4 py-2 rounded-lg text-xs font-semibold shadow transition-colors"
          >
            <span>Search Standards</span>
          </Link>
        </div>
      </div>
    );
  }

  if (loading) {
    return (
      <div className="min-h-[360px] bg-white border border-slate-200 rounded-xl p-8 flex flex-col items-center justify-center text-slate-500 gap-3">
        <Loader2 className="w-8 h-8 animate-spin text-blue-600" />
        <p className="text-sm font-medium">Resolving standard details across unified BIS corpus...</p>
      </div>
    );
  }

  if (error || !standard) {
    return (
      <div className="space-y-4">
        <Link
          href="/"
          className="inline-flex items-center gap-2 text-sm text-blue-700 hover:text-blue-900 font-semibold"
        >
          <ArrowLeft className="w-4 h-4" />
          <span>Back to Recommendation Engine</span>
        </Link>
        <div className="bg-red-50 border border-red-200 text-red-900 p-6 rounded-xl">
          <h3 className="text-base font-bold flex items-center gap-2">
            <AlertTriangle className="w-5 h-5 text-red-600" />
            <span>Standard Not Found</span>
          </h3>
          <p className="text-sm mt-1 text-slate-700">{error || `Could not find record for '${isNumber}'.`}</p>
        </div>
      </div>
    );
  }

  const alliedRoles = standard.allied_by_role ? Object.entries(standard.allied_by_role) : [];
  const totalAlliedCount = alliedRoles.reduce((acc, [_, items]) => acc + items.length, 0);

  return (
    <div className="space-y-6">
      {/* Top Breadcrumb Navigation */}
      <div>
        <Link
          href="/"
          className="inline-flex items-center gap-2 text-xs sm:text-sm text-blue-700 hover:text-blue-900 font-semibold transition-colors"
        >
          <ArrowLeft className="w-4 h-4" />
          <span>Back to Recommendation Engine</span>
        </Link>
      </div>

      {/* Main Standard Header Card */}
      <div className="bg-white border border-slate-200 rounded-xl p-6 shadow-sm space-y-4">
        <div className="flex flex-col md:flex-row md:items-start justify-between gap-4 border-b border-slate-100 pb-4">
          <div className="min-w-0">
            <div className="flex items-center gap-2.5 flex-wrap">
              <h2 className="text-2xl sm:text-3xl font-bold text-govNavy-900 tracking-tight font-mono break-words">
                {standard.is_number}
              </h2>
              {standard.year && (
                <span className="text-xs bg-slate-100 text-slate-700 border border-slate-200 px-2.5 py-1 rounded font-mono font-medium">
                  Year: {standard.year}
                </span>
              )}
              {getTierBadge()}
              {getStatusBadge()}
              {standard.superseded_by && (
                <span className="inline-flex items-center gap-1 bg-red-100 text-red-800 border border-red-200 px-2.5 py-1 rounded text-xs font-bold">
                  Replaced by {standard.superseded_by}
                </span>
              )}
            </div>

            <h3 className="text-lg sm:text-xl font-bold text-blue-950 mt-2 leading-snug">
              {standard.title}
            </h3>

            {standard.title_hindi && (
              <div className="text-sm text-slate-600 font-medium mt-1">
                {standard.title_hindi}
              </div>
            )}
          </div>

          <div className="flex items-center gap-2 shrink-0 flex-wrap">
            <Link
              href={`/graph?standard=${encodeURIComponent(standard.is_number)}`}
              className="inline-flex items-center gap-1.5 bg-govNavy-900 hover:bg-govNavy-800 text-white px-4 py-2 rounded-lg text-xs font-semibold shadow transition-colors"
            >
              <Network className="w-4 h-4 text-govSaffron-500" />
              <span>Explore Citation Graph</span>
            </Link>
            <Link
              href={`/compare?ids=${encodeURIComponent(standard.is_number)}`}
              className="inline-flex items-center gap-1.5 bg-white hover:bg-slate-50 border border-slate-200 text-slate-700 px-3.5 py-2 rounded-lg text-xs font-semibold shadow-sm transition-colors"
            >
              <Columns className="w-4 h-4 text-blue-600" />
              <span>Compare</span>
            </Link>
            <button
              type="button"
              onClick={() => setWatched(toggleWatch(standard.is_number, standard.title, standard))}
              title={watched ? 'Remove from watchlist' : 'Watch for changes'}
              className={`inline-flex items-center gap-1.5 px-3.5 py-2 rounded-lg text-xs font-semibold shadow-sm transition-colors border ${
                watched
                  ? 'bg-amber-50 hover:bg-amber-100 border-amber-300 text-amber-800'
                  : 'bg-white hover:bg-slate-50 border-slate-200 text-slate-700'
              }`}
            >
              <Eye className="w-4 h-4" />
              <span>{watched ? 'Watching' : 'Watch'}</span>
            </button>
            <button
              type="button"
              onClick={exportJson}
              title="Download dossier as JSON"
              className="inline-flex items-center gap-1.5 bg-white hover:bg-slate-50 border border-slate-200 text-slate-700 px-3 py-2 rounded-lg text-xs font-semibold shadow-sm transition-colors"
            >
              <Download className="w-4 h-4" />
              <span>JSON</span>
            </button>
            <button
              type="button"
              onClick={exportMarkdown}
              title="Download dossier as Markdown"
              className="inline-flex items-center gap-1.5 bg-white hover:bg-slate-50 border border-slate-200 text-slate-700 px-3 py-2 rounded-lg text-xs font-semibold shadow-sm transition-colors"
            >
              <Download className="w-4 h-4" />
              <span>MD</span>
            </button>
          </div>
        </div>

        {/* Currency Alert if Withdrawn or Superseded */}
        {(status === 'withdrawn' || status === 'superseded') && (
          <div className="bg-red-50 border-l-4 border-red-600 p-4 rounded-r text-xs sm:text-sm text-red-950">
            <p className="font-bold flex items-center gap-2 text-red-800">
              <AlertTriangle className="w-5 h-5 text-red-600 shrink-0" />
              <span>OFFICIAL REGULATORY NOTICE: Standard is {status.toUpperCase()}</span>
            </p>
            <p className="mt-1 text-slate-700 leading-relaxed">
              This standard has been marked as <strong>{status.toUpperCase()}</strong> in official Bureau of Indian Standards
              records. {standard.superseded_by ? (
                <>It has been replaced by <strong className="text-red-900 underline">{standard.superseded_by}</strong>.</>
              ) : (
                'Please verify latest active revisions on the BIS portal before citing in procurement tenders.'
              )}
            </p>
          </div>
        )}

        {/* Tier 2 Catalogue Notice */}
        {!isEnriched && (
          <div className="bg-slate-50 border border-slate-200 p-4 rounded-lg text-xs sm:text-sm text-slate-700 flex items-start gap-3">
            <Info className="w-5 h-5 text-slate-500 shrink-0 mt-0.5" />
            <div>
              <p className="font-semibold text-slate-900">
                Catalogue metadata available. Detailed compliance dossier is not currently available for this standard.
              </p>
              <p className="text-slate-600 mt-1 leading-relaxed">
                This record represents a verified national standard published in the official BIS catalogue. Full normative
                references, technical scope, and specific certification schemes are populated for Tier 1 seed standards. Standard
                conformity tender specifications remain fully available below.
              </p>
            </div>
          </div>
        )}

        {/* Metadata Grid */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 text-xs pt-2">
          <div className="border border-slate-100 rounded-lg p-3 bg-slate-50/50">
            <div className="flex items-center gap-1.5 text-slate-500 font-medium">
              <Layers className="w-4 h-4 text-indigo-600" />
              <span>Department</span>
            </div>
            <div className="font-bold text-govNavy-900 mt-1">
              {standard.department_name || standard.department || standard.division || 'CED / ETD'}
            </div>
          </div>

          <div className="border border-slate-100 rounded-lg p-3 bg-slate-50/50">
            <div className="flex items-center gap-1.5 text-slate-500 font-medium">
              <Calendar className="w-4 h-4 text-blue-600" />
              <span>Published / Status</span>
            </div>
            <div className="font-bold text-govNavy-900 mt-1">
              {standard.published_on || (standard.year ? `Year ${standard.year}` : 'Active BIS')}
            </div>
          </div>

          <div className="border border-slate-100 rounded-lg p-3 bg-slate-50/50">
            <div className="flex items-center gap-1.5 text-slate-500 font-medium">
              <BookOpen className="w-4 h-4 text-teal-600" />
              <span>Aspect / Type</span>
            </div>
            <div className="font-bold text-govNavy-900 mt-1">
              {standard.aspect || 'Product Standard'}
            </div>
          </div>

          <div className="border border-slate-100 rounded-lg p-3 bg-slate-50/50">
            <div className="flex items-center gap-1.5 text-slate-500 font-medium">
              <ShieldCheck className="w-4 h-4 text-amber-600" />
              <span>Mandatory ISI / QCO</span>
            </div>
            <div className="font-bold mt-1">
              {standard.certification?.mandatory ? (
                <span className="text-amber-700">Gazette Enforceable</span>
              ) : (
                <span className="text-slate-500">Voluntary / Direct</span>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* Tier 1 Only Sections */}
      {isEnriched && (
        <div className="space-y-6">
          {/* Technical Scope */}
          {standard.scope && (
            <div className="bg-white border border-slate-200 rounded-xl p-6 shadow-sm space-y-2">
              <h4 className="text-sm font-bold text-govNavy-900 flex items-center gap-2 border-b border-slate-100 pb-2">
                <FileText className="w-4 h-4 text-blue-600" />
                <span>Technical Scope & Coverage</span>
              </h4>
              <p className="text-xs sm:text-sm text-slate-700 leading-relaxed pt-1">
                {standard.scope}
              </p>
            </div>
          )}

          {/* Mandatory Certification Details */}
          {standard.certification && (standard.certification.mandatory || standard.certification.scheme) && (
            <div className="bg-amber-50/70 border border-amber-200 rounded-xl p-5 shadow-sm space-y-2">
              <h4 className="text-sm font-bold text-amber-950 flex items-center gap-2">
                <ShieldCheck className="w-5 h-5 text-amber-700" />
                <span>Quality Control Order (QCO) & Certification Regime</span>
              </h4>
              <p className="text-xs sm:text-sm text-amber-900 leading-relaxed">
                Supplies under this standard are governed by{' '}
                <strong>{standard.certification.scheme_label || standard.certification.scheme || 'BIS Certification'}</strong>.
                Bidders must submit verified licensing proof and CM/L or R-number documentation during technical qualification.
              </p>
            </div>
          )}

          {/* Gazette Amendments */}
          {standard.amendments && standard.amendments.length > 0 && (
            <div className="bg-white border border-slate-200 rounded-xl p-6 shadow-sm space-y-3">
              <h4 className="text-sm font-bold text-govNavy-900 flex items-center gap-2 border-b border-slate-100 pb-2">
                <span>📜 Gazette Amendments & Revisions ({standard.amendments.length})</span>
              </h4>
              <div className="flex items-center gap-2 flex-wrap">
                {standard.amendments.map((amdt) => (
                  <span
                    key={amdt.number}
                    className="inline-flex items-center gap-1 bg-blue-50 text-blue-800 border border-blue-200 px-3 py-1 rounded text-xs font-mono font-medium"
                  >
                    <span>Amendment {amdt.number}</span>
                    {amdt.date && <span className="text-blue-500">({amdt.date})</span>}
                  </span>
                ))}
              </div>
            </div>
          )}

          {/* Allied Standards & Normative Taxonomy */}
          {totalAlliedCount > 0 && (
            <div className="bg-white border border-slate-200 rounded-xl p-6 shadow-sm space-y-4">
              <div className="flex items-center justify-between border-b border-slate-100 pb-3">
                <h4 className="text-sm font-bold text-govNavy-900 flex items-center gap-2">
                  <Network className="w-4 h-4 text-govSaffron-500" />
                  <span>Allied Standards & Normative Citation Network ({totalAlliedCount} standards)</span>
                </h4>
                <Link
                  href={`/graph?standard=${encodeURIComponent(standard.is_number)}`}
                  className="text-xs text-blue-700 hover:underline font-semibold"
                >
                  View in Graph →
                </Link>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {alliedRoles.map(([role, items]) => (
                  <div key={role} className="border border-slate-200 rounded-lg p-3 bg-slate-50/50">
                    <div className="flex items-center justify-between font-bold text-xs text-slate-800 mb-2">
                      <span>{role}</span>
                      <span className="bg-slate-200 text-slate-700 px-2 py-0.5 rounded text-[10px]">
                        {items.length}
                      </span>
                    </div>
                    <ul className="space-y-1.5 text-xs">
                      {items.map((it) => (
                        <li key={it.is_number} className="flex items-baseline justify-between gap-2">
                          <Link
                            href={getStandardDetailUrl(it.is_number)}
                            className="font-mono font-semibold text-blue-700 hover:underline"
                          >
                            {it.is_number}
                          </Link>
                          <span className="text-slate-600 truncate flex-1 text-right" title={it.title}>
                            {it.title}
                          </span>
                        </li>
                      ))}
                    </ul>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      {/* Version timeline */}
      <div className="bg-white border border-slate-200 rounded-xl p-6 shadow-sm space-y-3">
        <h4 className="text-sm font-bold text-govNavy-900 flex items-center gap-2 border-b border-slate-100 pb-2">
          <History className="w-4 h-4 text-blue-600" />
          <span>Version Timeline</span>
        </h4>
        <ol className="relative ml-1.5 space-y-3 border-l-2 border-slate-200 pl-4">
          <li className="relative">
            <span className="absolute -left-[21px] top-1 h-2.5 w-2.5 rounded-full bg-blue-600 ring-2 ring-blue-100" />
            <p className="text-xs font-bold text-slate-800">
              {standard.published_on || (standard.year ? `Edition ${standard.year}` : 'First edition on record')}
            </p>
            <p className="text-[11px] text-slate-500">Base edition in the unified corpus.</p>
          </li>
          {(standard.amendments || []).map((a) => (
            <li key={a.number} className="relative">
              <span className="absolute -left-[21px] top-1 h-2.5 w-2.5 rounded-full bg-govSaffron-500 ring-2 ring-amber-100" />
              <p className="text-xs font-bold text-slate-800">
                Amendment {a.number}{a.date ? ` (${a.date})` : ''}
              </p>
              <p className="text-[11px] text-slate-500">Gazette amendment incorporated into the currency label.</p>
            </li>
          ))}
          {(status === 'withdrawn' || status === 'superseded') && (
            <li className="relative">
              <span className="absolute -left-[21px] top-1 h-2.5 w-2.5 rounded-full bg-red-600 ring-2 ring-red-100" />
              <p className="text-xs font-bold text-red-800">
                {status === 'withdrawn' ? 'Withdrawn' : 'Superseded'}
                {standard.superseded_by ? ` → ${standard.superseded_by}` : ''}
              </p>
              <p className="text-[11px] text-slate-500">Do not cite in new tenders{standard.superseded_by ? '; use the successor.' : '.'}</p>
            </li>
          )}
        </ol>
        <p className="text-[11px] text-slate-400">
          Amendment diffs require amendment text, which BIS does not publish in this corpus — the timeline above reflects every versioned fact on record.
        </p>
      </div>

      {/* Source traceability */}
      <div className="bg-white border border-slate-200 rounded-xl p-6 shadow-sm space-y-2">
        <h4 className="text-sm font-bold text-govNavy-900 flex items-center gap-2 border-b border-slate-100 pb-2">
          <ShieldCheck className="w-4 h-4 text-teal-600" />
          <span>Source Traceability</span>
        </h4>
        <dl className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-xs">
          <div className="flex justify-between gap-2 border border-slate-100 rounded-lg px-3 py-2 bg-slate-50/50">
            <dt className="text-slate-500">Tier</dt>
            <dd className="font-semibold text-slate-800">{isEnriched ? 'Seed enriched dossier' : 'Official BIS catalogue'}</dd>
          </div>
          <div className="flex justify-between gap-2 border border-slate-100 rounded-lg px-3 py-2 bg-slate-50/50">
            <dt className="text-slate-500">Canonical key</dt>
            <dd className="font-mono font-semibold text-slate-800">{standard.canonical_key || standard.is_number}</dd>
          </div>
          <div className="flex justify-between gap-2 border border-slate-100 rounded-lg px-3 py-2 bg-slate-50/50">
            <dt className="text-slate-500">Sources</dt>
            <dd className="font-semibold text-slate-800 text-right">{(standard.sources || []).join(', ') || 'BIS corpus'}</dd>
          </div>
          <div className="flex justify-between gap-2 border border-slate-100 rounded-lg px-3 py-2 bg-slate-50/50">
            <dt className="text-slate-500">Department</dt>
            <dd className="font-semibold text-slate-800 text-right">{standard.department_name || standard.department || standard.division || '—'}</dd>
          </div>
        </dl>
      </div>

      {/* Record completeness & known gaps */}
      <div className="bg-white border border-slate-200 rounded-xl p-6 shadow-sm space-y-2">
        <h4 className="text-sm font-bold text-govNavy-900 flex items-center gap-2 border-b border-slate-100 pb-2">
          <Info className="w-4 h-4 text-blue-600" />
          <span>Record Completeness</span>
        </h4>
        {(() => {
          const gaps: { ok: boolean; text: string }[] = [
            {
              ok: !!standard.scope,
              text: standard.scope
                ? 'Technical scope is published for this record.'
                : 'No scope text published for this tier — summaries and semantic matching fall back to title and catalogue metadata.',
            },
            {
              ok: totalAlliedCount > 0 || citedCount > 0,
              text: totalAlliedCount > 0 || citedCount > 0
                ? `Connected: ${totalAlliedCount} allied outgoing, ${citedCount} citing incoming.`
                : 'No normative references mapped — the graph explorer shows same-division similar records instead (labeled, never normative).',
            },
            {
              ok: !!(standard.certification && standard.certification.scheme),
              text: standard.certification && standard.certification.scheme
                ? `Certification regime on record: ${standard.certification.scheme_label || standard.certification.scheme}.`
                : 'No certification scheme on record — treat tender certification clauses as unverified for this standard.',
            },
            {
              ok: status === 'current',
              text: status === 'current'
                ? 'Status is current in the unified corpus.'
                : `Status is ${status} — verify the successor before citing. See the timeline above.`,
            },
          ];
          const okCount = gaps.filter((g) => g.ok).length;
          return (
            <>
              <div className="flex items-center gap-2 text-xs">
                <div className="h-2 flex-1 overflow-hidden rounded-full bg-slate-100">
                  <div
                    className={`h-full rounded-full ${okCount === gaps.length ? 'bg-emerald-500' : okCount >= 2 ? 'bg-amber-500' : 'bg-red-500'}`}
                    style={{ width: `${(okCount / gaps.length) * 100}%` }}
                  />
                </div>
                <span className="font-bold tabular-nums text-slate-700">{okCount}/{gaps.length}</span>
              </div>
              <ul className="space-y-1.5">
                {gaps.map((g, i) => (
                  <li key={i} className="flex gap-2 text-xs leading-relaxed">
                    {g.ok ? (
                      <CheckCircle2 className="h-4 w-4 shrink-0 text-emerald-600" aria-hidden />
                    ) : (
                      <AlertTriangle className="h-4 w-4 shrink-0 text-amber-600" aria-hidden />
                    )}
                    <span className="text-slate-600">{g.text}</span>
                  </li>
                ))}
              </ul>
            </>
          );
        })()}
      </div>

      {/* Impact analysis: cited by */}
      <div className="bg-white border border-slate-200 rounded-xl p-6 shadow-sm space-y-3">
        <h4 className="text-sm font-bold text-govNavy-900 flex items-center gap-2 border-b border-slate-100 pb-2">
          <Network className="w-4 h-4 text-govSaffron-500" />
          <span>Impact Analysis — Cited By ({citedCount})</span>
        </h4>
        <p className="text-xs text-slate-500">
          Standards that normatively cite this one. If this standard is revised or withdrawn, these dossiers are the blast radius to re-audit.
        </p>
        {citedBy.length === 0 ? (
          <p className="text-xs text-slate-400">No citing standards mapped in the enriched citation graph.</p>
        ) : (
          <ul className="grid grid-cols-1 md:grid-cols-2 gap-2 text-xs">
            {citedBy.map((c) => (
              <li key={c.is_number} className="flex items-center justify-between gap-2 border border-slate-100 rounded-lg px-3 py-2 bg-slate-50/50">
                <Link href={getStandardDetailUrl(c.is_number)} className="font-mono font-semibold text-blue-700 hover:underline">
                  {c.is_number}
                </Link>
                <span className="text-slate-500 truncate" title={c.title}>{c.role}</span>
              </li>
            ))}
          </ul>
        )}
      </div>

      {/* Suggest a correction */}
      <div className="bg-white border border-slate-200 rounded-xl p-6 shadow-sm space-y-3">
        <h4 className="text-sm font-bold text-govNavy-900 flex items-center gap-2 border-b border-slate-100 pb-2">
          <Send className="w-4 h-4 text-blue-600" />
          <span>Suggest a Correction</span>
        </h4>
        {corrSent ? (
          <p className="text-xs text-emerald-700 bg-emerald-50 border border-emerald-200 rounded-lg p-3">
            Queued for admin review. Nothing is applied automatically — export the outbox from Governance for ingestion.
          </p>
        ) : (
          <div className="flex flex-col sm:flex-row gap-2">
            <select value={corrField} onChange={(e) => setCorrField(e.target.value)} className="select sm:w-40" aria-label="Field to correct">
              <option value="title">Title</option>
              <option value="scope">Scope</option>
              <option value="status">Status</option>
              <option value="amendments">Amendments</option>
              <option value="certification">Certification</option>
              <option value="references">References</option>
            </select>
            <input
              type="text"
              value={corrMsg}
              onChange={(e) => setCorrMsg(e.target.value)}
              placeholder="Describe the correction with a source…"
              className="input flex-1"
            />
            <button
              type="button"
              disabled={!corrMsg.trim()}
              onClick={() => {
                saveCorrection(standard.is_number, corrField, corrMsg.trim());
                setCorrMsg('');
                setCorrSent(true);
              }}
              className="btn-secondary shrink-0"
            >
              Queue correction
            </button>
          </div>
        )}
      </div>

      {/* Tender Clause Section (Available for both Tier 1 and Tier 2) */}
      {standard.tender_clause && (
        <div className="bg-emerald-50/60 border border-emerald-200 rounded-xl p-6 shadow-sm space-y-3">
          <div className="flex items-center justify-between border-b border-emerald-200/60 pb-3">
            <div>
              <h4 className="text-base font-bold text-emerald-950 flex items-center gap-2">
                <FileText className="w-5 h-5 text-emerald-700" />
                <span>Legally Enforceable Tender Specification Clause</span>
              </h4>
              <p className="text-xs text-emerald-800 mt-0.5">
                Formatted for direct insertion into GeM tenders, NITs, and RFPs.
              </p>
            </div>
            <button
              type="button"
              onClick={copyClause}
              className="flex items-center gap-1.5 bg-white hover:bg-emerald-100 border border-emerald-300 text-emerald-900 px-3 py-1.5 rounded-lg text-xs font-semibold shadow-xs transition-colors"
            >
              {copied ? <Check className="w-4 h-4 text-emerald-600" /> : <Copy className="w-4 h-4" />}
              <span>{copied ? 'Copied!' : 'Copy Clause'}</span>
            </button>
          </div>

          <pre className="whitespace-pre-wrap font-mono text-xs text-emerald-950 leading-relaxed bg-white/80 p-4 rounded-lg border border-emerald-200/60">
            {standard.tender_clause}
          </pre>
        </div>
      )}
    </div>
  );
}
