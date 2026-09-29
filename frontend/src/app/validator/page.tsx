'use client';

import React, { useState } from 'react';
import Link from 'next/link';
import {
  ShieldAlert,
  AlertTriangle,
  ShieldCheck,
  CheckCircle2,
  Lightbulb,
  Loader2,
  Building2,
  Sparkles,
  ExternalLink,
  XCircle,
} from 'lucide-react';
import { validateSpecification, getStandardDetailUrl } from '@/lib/api';
import { logHistory } from '@/lib/history';
import PageHeader from '@/components/PageHeader';
import Stat from '@/components/Stat';
import { ValidateResponse } from '@/lib/types';


const SAMPLE_1 = `Notice Inviting Tender (NIT) for Substation Foundation Works:
1. All cement used in RCC structural works shall strictly conform to IS 8112:1989 for 43 grade ordinary portland cement.
2. The reinforcement steel shall conform to IS 1786.
3. Aggregate testing shall comply with IS 383.`;

const SAMPLE_2 = `Procurement Specification for LV Power Supply:
1. Power cables shall be 1100V grade 3-core copper conductor conforming to IS 1554 (Part 1).
2. Installation shall be underground in trenches as per standard CPWD guidelines.`;

export default function ValidatorPage() {
  const [specText, setSpecText] = useState('');
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<ValidateResponse | null>(null);
  const [error, setError] = useState<string | null>(null);

  const handleAudit = async () => {
    if (!specText.trim()) return;
    setLoading(true);
    setError(null);

    try {
      const res = await validateSpecification(specText);
      setResult(res);
      try {
        logHistory('audit', specText.slice(0, 120), `${res.issues.length} issues · ${res.suggested_additions.length} suggestions`, '/validator');
      } catch { /* history is non-critical */ }
    } catch (err: any) {
      setError(err.message || 'Validation failed');
    } finally {
      setLoading(false);
    }
  };

  const highIssues = result?.issues.filter((i) => i.severity === 'high') ?? [];
  const medIssues = result?.issues.filter((i) => i.severity === 'medium') ?? [];
  const lowIssues = result?.issues.filter((i) => i.severity !== 'high' && i.severity !== 'medium') ?? [];

  return (
    <div className="space-y-6">
      <PageHeader
        icon={ShieldAlert}
        eyebrow="Compliance audit"
        title="Tender Specification Audit & Validator"
        description="Paste an existing procurement document or draft tender. The validator automatically extracts all Indian Standard citations, audits their currency, flags superseded/withdrawn standards, checks mandatory certification clauses, and suggests missing test methods."
      />

      {/* Sample Buttons */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
        <button
          type="button"
          onClick={() => setSpecText(SAMPLE_1)}
          className="text-left card card-hover p-3 text-xs"
        >
          <span className="font-semibold text-slate-800 block">
            📄 Load Sample Spec with Superseded Cement Citation (IS 8112)
          </span>
          <span className="text-slate-500 text-[11px]">Cites IS 8112:1989, IS 1786, IS 383</span>
        </button>

        <button
          type="button"
          onClick={() => setSpecText(SAMPLE_2)}
          className="text-left card card-hover p-3 text-xs"
        >
          <span className="font-semibold text-slate-800 block">
            📄 Load Sample Spec with Underground Cables (Missing Allied)
          </span>
          <span className="text-slate-500 text-[11px]">Cites IS 1554 (Part 1) missing test standards</span>
        </button>
      </div>

      {/* Input Text Area */}
      <div className="bg-white border border-slate-200 rounded-xl p-4 sm:p-5 shadow-sm space-y-4">
        <textarea
          value={specText}
          onChange={(e) => setSpecText(e.target.value)}
          rows={6}
          placeholder="Paste specification clauses containing IS 1554, IS 8112, IS 269, IS 1786, etc..."
          className="w-full border border-slate-300 rounded-lg p-3 text-sm focus:outline-none focus:ring-2 focus:ring-blue-600 focus:border-transparent text-slate-900 font-mono"
        />

        <div className="flex justify-end">
          <button
            type="button"
            onClick={handleAudit}
            disabled={loading || !specText.trim()}
            className="flex items-center gap-2 bg-govNavy-900 hover:bg-govNavy-800 text-white font-semibold px-6 py-2.5 rounded-lg text-sm shadow transition-colors disabled:opacity-50"
          >
            {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <ShieldAlert className="w-4 h-4 text-govSaffron-500" />}
            <span>Run Full Compliance Audit</span>
          </button>
        </div>
      </div>

      {/* Error */}
      {error && (
        <div className="bg-red-50 border border-red-300 text-red-900 p-4 rounded-xl text-sm">
          ⚠️ {error}
        </div>
      )}

      {/* Results Section */}
      {result && (
        <div className="space-y-5">
          {/* Completeness score + export pack */}
          <div className="card-pad !py-3">
            <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
              <div className="flex items-center gap-3">
                <div
                  className={`flex h-12 w-12 shrink-0 items-center justify-center rounded-full text-base font-bold tabular-nums ring-4 ${
                    (result.completeness?.score ?? 0) >= 85
                      ? 'bg-emerald-100 text-emerald-800 ring-emerald-100'
                      : (result.completeness?.score ?? 0) >= 60
                      ? 'bg-amber-100 text-amber-800 ring-amber-100'
                      : 'bg-red-100 text-red-800 ring-red-100'
                  }`}
                >
                  {result.completeness?.score ?? '—'}
                </div>
                <div>
                  <p className="text-sm font-bold text-govNavy-900">
                    Specification completeness: {result.completeness?.grade?.trim() || 'Unscored'}
                  </p>
                  <p className="text-[11px] text-slate-500">{result.completeness?.detail}</p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => {
                  const lines = [
                    '# IS Sarthi Tender Audit Report',
                    '',
                    `Completeness: ${result.completeness?.score ?? '—'} (${result.completeness?.grade?.trim() || 'unscored'})`,
                    `${result.completeness?.detail || ''}`,
                    '',
                    '## Cited standards',
                    ...result.cited.map((c) => `- ${c}`),
                    '',
                    '## Issues',
                    ...result.issues.map((i) => `- [${i.severity}] ${i.is_number}: ${i.issue} → ${i.action}`),
                    '',
                    '## Suggested additions',
                    ...result.suggested_additions.map((s) => `- ${s.is_number} (${s.role}, via ${s.referenced_by}): ${s.title || ''}`),
                  ];
                  const blob = new Blob([lines.join('\n')], { type: 'text/markdown' });
                  const url = URL.createObjectURL(blob);
                  const a = document.createElement('a');
                  a.href = url;
                  a.download = `is_sarthi_audit_${Date.now()}.md`;
                  a.click();
                  URL.revokeObjectURL(url);
                }}
                className="btn-secondary shrink-0"
              >
                Export audit pack
              </button>
            </div>
          </div>
          {/* Summary Scorecards */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            <Stat icon={CheckCircle2} label="Cited Standards" value={result.cited.length} sub="IS references found" />
            <Stat
              icon={AlertTriangle}
              label="Critical Superseded"
              value={highIssues.length}
              sub={highIssues.length > 0 ? 'Needs replacement' : 'No critical defects'}
              tone={highIssues.length > 0 ? 'red' : 'emerald'}
            />
            <Stat icon={ShieldCheck} label="Certification Warnings" value={medIssues.length} sub="QCO / scheme clauses" tone="amber" />
            <Stat icon={Lightbulb} label="Suggested Additions" value={result.suggested_additions.length} sub="Missing allied refs" tone="blue" />
          </div>

          {/* Critical Issues */}
          {highIssues.length > 0 && (
            <div className="bg-red-50 border border-red-200 rounded-xl p-4 sm:p-5">
              <h4 className="text-base font-bold text-red-900 flex items-center gap-2 mb-3">
                <AlertTriangle className="w-5 h-5 text-red-600" />
                <span>Critical Defects: Superseded or Withdrawn Standards</span>
              </h4>
              <div className="space-y-3">
                {highIssues.map((iss, idx) => (
                  <div key={idx} className="bg-white border border-red-200 p-3 rounded-lg text-xs sm:text-sm">
                    <div className="font-bold text-red-800">{iss.is_number}: {iss.issue}</div>
                    <div className="text-slate-700 mt-1">
                      <strong>Recommended Action:</strong> {iss.action}
                    </div>
                    <Link
                      href={getStandardDetailUrl(iss.is_number)}
                      className="text-blue-700 hover:underline font-semibold inline-flex items-center gap-1 mt-1.5"
                    >
                      <span>Open dossier for replacement & currency →</span>
                      <ExternalLink className="w-3 h-3" />
                    </Link>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Compliance Warnings */}
          {medIssues.length > 0 && (
            <div className="bg-amber-50 border border-amber-200 rounded-xl p-4 sm:p-5">
              <h4 className="text-base font-bold text-amber-900 flex items-center gap-2 mb-3">
                <ShieldCheck className="w-5 h-5 text-amber-600" />
                <span>Compliance Warnings: Mandatory Certification Clauses</span>
              </h4>
              <div className="space-y-3">
                {medIssues.map((iss, idx) => (
                  <div key={idx} className="bg-white border border-amber-200 p-3 rounded-lg text-xs sm:text-sm">
                    <div className="font-bold text-amber-800">{iss.is_number}: {iss.issue}</div>
                    <div className="text-slate-700 mt-1">
                      <strong>Recommended Action:</strong> {iss.action}
                    </div>
                    <Link
                      href={getStandardDetailUrl(iss.is_number)}
                      className="text-blue-700 hover:underline font-semibold inline-flex items-center gap-1 mt-1.5"
                    >
                      <span>Open dossier for certification regime →</span>
                      <ExternalLink className="w-3 h-3" />
                    </Link>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Low-severity notices (review lapses, unknown citations) */}
          {lowIssues.length > 0 && (
            <div className="bg-slate-50 border border-slate-200 rounded-xl p-4 sm:p-5">
              <h4 className="text-base font-bold text-slate-700 flex items-center gap-2 mb-3">
                <ShieldCheck className="w-5 h-5 text-slate-500" />
                <span>Notices ({lowIssues.length})</span>
              </h4>
              <div className="space-y-2.5">
                {lowIssues.map((iss, idx) => (
                  <div key={idx} className="bg-white border border-slate-200 p-3 rounded-lg text-xs sm:text-sm">
                    <div className="font-bold text-slate-800">
                      {iss.is_number} <span className="font-normal text-slate-400">· {iss.severity}</span>: {iss.issue}
                    </div>
                    <div className="text-slate-600 mt-1">
                      <strong>Recommended Action:</strong> {iss.action}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Validated Standards */}
          {result.cited.length > 0 && (
            <div className="bg-white border border-slate-200 rounded-xl p-4 sm:p-5">
              <h4 className="text-base font-bold text-slate-800 flex items-center gap-2 mb-3">
                <CheckCircle2 className="w-5 h-5 text-emerald-600" />
                <span>Validated Standards Mentioned ({result.cited.length})</span>
              </h4>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                {result.matched_standards && result.matched_standards.length > 0 ? (
                  result.matched_standards.map((m) => {
                    const isEnriched = m.tier === 'enriched';
                    const isWithdrawn = m.status === 'withdrawn';
                    return (
                      <div
                        key={m.is_number}
                        className="bg-slate-50 border border-slate-200 rounded-lg p-3 flex flex-col justify-between gap-1.5"
                      >
                        <div className="flex items-center justify-between gap-2 flex-wrap">
                          <Link
                            href={getStandardDetailUrl(m.is_number)}
                            className="font-mono font-bold text-govNavy-900 hover:text-blue-700 text-xs inline-flex items-center gap-1"
                          >
                            <span>{m.is_number}</span>
                            <ExternalLink className="w-3 h-3 opacity-50" />
                          </Link>

                          <div className="flex items-center gap-1.5 flex-wrap">
                            {isEnriched ? (
                              <span className="inline-flex items-center gap-1 bg-blue-50 text-blue-800 border border-blue-200 px-2 py-0.5 rounded text-[11px] font-semibold">
                                <Sparkles className="w-3 h-3 text-blue-600" />
                                <span>Seed Enriched Dossier</span>
                              </span>
                            ) : (
                              <span className="inline-flex items-center gap-1 bg-slate-100 text-slate-800 border border-slate-300 px-2 py-0.5 rounded text-[11px] font-semibold">
                                <Building2 className="w-3 h-3 text-slate-600" />
                                <span>Official BIS Catalogue</span>
                              </span>
                            )}

                            {isWithdrawn && (
                              <span className="inline-flex items-center gap-1 bg-rose-50 text-rose-700 border border-rose-300 px-2 py-0.5 rounded text-[11px] font-semibold">
                                <XCircle className="w-3 h-3 text-rose-600" />
                                <span>Withdrawn</span>
                              </span>
                            )}
                          </div>
                        </div>

                        {m.title && (
                          <div className="text-slate-600 text-xs truncate" title={m.title}>
                            {m.title}
                          </div>
                        )}
                        {m.department && (
                          <div className="text-[11px] text-slate-400">
                            Dept: {m.department}
                          </div>
                        )}
                      </div>
                    );
                  })
                ) : (
                  result.cited.map((c) => (
                    <Link
                      key={c}
                      href={getStandardDetailUrl(c)}
                      className="inline-flex items-center justify-between bg-slate-50 border border-slate-200 px-3 py-2 rounded-md text-xs font-mono font-semibold text-slate-800 hover:border-blue-400 transition-colors"
                    >
                      <span>{c}</span>
                      <ExternalLink className="w-3 h-3 text-slate-400" />
                    </Link>
                  ))
                )}
              </div>
            </div>
          )}


          {/* Suggested Additions */}
          {result.suggested_additions.length > 0 && (
            <div className="bg-blue-50 border border-blue-200 rounded-xl p-4 sm:p-5">
              <h4 className="text-base font-bold text-blue-900 flex items-center gap-2 mb-2">
                <Lightbulb className="w-5 h-5 text-blue-600" />
                <span>Missing Allied Standards to Include in Acceptance Criteria</span>
              </h4>
              <p className="text-xs text-blue-800 mb-3">
                These standards are normative references of your cited items. Adding them defines acceptance testing and
                prevents legal disputes:
              </p>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-2 text-xs">
                {result.suggested_additions.map((item) => (
                  <div key={item.is_number} className="bg-white border border-blue-100 p-2.5 rounded-md shadow-sm">
                    <div className="flex items-center justify-between font-mono font-bold text-govNavy-900">
                      <span>{item.is_number}</span>
                      <span className="text-[10px] bg-blue-100 text-blue-800 px-1.5 py-0.5 rounded font-sans font-medium">
                        {item.role}
                      </span>
                    </div>
                    <div className="text-slate-600 text-[11px] mt-1 truncate" title={item.title}>
                      {item.title || 'Normative reference'}
                    </div>
                    <div className="text-[10px] text-slate-400 mt-0.5">
                      Referenced by {item.referenced_by}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
