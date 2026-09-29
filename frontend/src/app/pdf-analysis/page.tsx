'use client';

import React, { useRef, useState } from 'react';
import Link from 'next/link';
import { FileSearch, FileUp, Loader2, ExternalLink, AlertTriangle } from 'lucide-react';
import { extractDocumentText, validateSpecification, recommendStandards, getStandardDetailUrl } from '@/lib/api';
import { ValidateResponse, Recommendation } from '@/lib/types';
import { logHistory } from '@/lib/history';
import RecommendationCard from '@/components/RecommendationCard';
import StatusChip from '@/components/StatusChip';
import PageHeader from '@/components/PageHeader';
import EmptyState from '@/components/EmptyState';

export default function PdfAnalysisPage() {
  const [extracting, setExtracting] = useState(false);
  const [analyzing, setAnalyzing] = useState(false);
  const [fileName, setFileName] = useState('');
  const [fileKb, setFileKb] = useState(0);
  const [fileExt, setFileExt] = useState('');
  const [text, setText] = useState('');
  const [validation, setValidation] = useState<ValidateResponse | null>(null);
  const [recommendations, setRecommendations] = useState<Recommendation[]>([]);
  const [error, setError] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const lower = file.name.toLowerCase();
    if (!['.pdf', '.docx', '.txt'].some((ext) => lower.endsWith(ext))) {
      setError('Please upload .pdf, .docx, or .txt.');
      if (fileInputRef.current) fileInputRef.current.value = '';
      return;
    }
    if (file.size > 20 * 1024 * 1024) {
      setError('File exceeds the 20 MB limit.');
      if (fileInputRef.current) fileInputRef.current.value = '';
      return;
    }
    setExtracting(true);
    setError(null);
    setValidation(null);
    setRecommendations([]);
    try {
      const data = await extractDocumentText(file);
      setFileKb(Math.max(1, Math.round(file.size / 1024)));
      setFileExt(lower.endsWith('.pdf') ? 'pdf' : lower.endsWith('.docx') ? 'docx' : 'txt');
      setText(data.text);
      setFileName(data.filename);
      try {
        logHistory('upload', data.filename, `${data.character_count} chars extracted`, '/pdf-analysis');
      } catch { /* ignore */ }
      setAnalyzing(true);
      const [val, rec] = await Promise.all([
        validateSpecification(data.text.slice(0, 20000)).catch(() => null),
        recommendStandards(data.text.slice(0, 2000), 5).catch(() => null),
      ]);
      if (val) setValidation(val);
      if (rec?.recommendations?.length) setRecommendations(rec.recommendations);
    } catch (err: any) {
      setError(err?.message || 'Failed to process document.');
    } finally {
      setExtracting(false);
      setAnalyzing(false);
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  };

  const cited = validation?.matched_standards ?? [];
  const highIssues = validation?.issues.filter((i) => i.severity === 'high') ?? [];

  return (
    <div className="space-y-6">
      <PageHeader
        icon={FileSearch}
        eyebrow="Document audit"
        title="PDF Analysis"
        description="Upload a tender, NIT, or specification (.pdf, .docx, .txt). Text is extracted in-memory, cited standards are detected, and clause matches are recommended — nothing is stored server-side."
      />

      <div className="bg-white border border-slate-200 rounded-xl p-6 shadow-sm text-center space-y-3">
        <label
          className={`inline-flex items-center gap-2 font-semibold px-6 py-3 rounded-lg text-sm shadow transition-colors ${
            extracting ? 'bg-slate-200 text-slate-500 cursor-wait' : 'bg-govNavy-900 hover:bg-govNavy-800 text-white cursor-pointer'
          }`}
        >
          {extracting ? <Loader2 className="w-4 h-4 animate-spin" /> : <FileUp className="w-4 h-4 text-govSaffron-500" />}
          <span>{extracting ? 'Extracting…' : 'Upload Document (PDF, DOCX, TXT)'}</span>
          <input
            ref={fileInputRef}
            type="file"
            accept=".pdf,.docx,.txt,application/pdf,application/vnd.openxmlformats-officedocument.wordprocessingml.document,text/plain"
            onChange={handleFile}
            disabled={extracting}
            className="hidden"
          />
        </label>
        {fileName && <p className="text-xs text-slate-500">Analyzing: <strong>{fileName}</strong></p>}
        {analyzing && (
          <p className="text-xs text-blue-700 flex items-center justify-center gap-2">
            <Loader2 className="w-3.5 h-3.5 animate-spin" />
            <span>Detecting cited standards and matching clauses…</span>
          </p>
        )}
      </div>

      {error && (
        <div className="bg-red-50 border border-red-300 text-red-900 p-4 rounded-xl text-sm">
          ⚠️ {error}
        </div>
      )}

      {!extracting && !text && !error && (
        <EmptyState
          icon={FileSearch}
          title="No document analyzed yet"
          body="Upload a file to see detected standards and clause matches here."
        />
      )}

      {text && (
        <div className="space-y-5">
          <div className="bg-white border border-slate-200 rounded-xl p-4 shadow-sm">
            <h4 className="text-sm font-bold text-slate-800 mb-2">Extracted text preview ({text.length} chars)</h4>
            <pre className="whitespace-pre-wrap text-xs text-slate-600 bg-slate-50 border border-slate-100 rounded-lg p-3 max-h-48 overflow-y-auto font-mono">
              {text.slice(0, 2000)}{text.length > 2000 ? '\n… (truncated)' : ''}
            </pre>
            <div className="mt-3 grid grid-cols-2 sm:grid-cols-4 gap-2 text-center">
              <div className="rounded-lg bg-slate-50 border border-slate-100 p-2">
                <div className="text-base font-bold tabular-nums text-govNavy-900">{fileKb.toLocaleString()} KB</div>
                <div className="text-[10px] text-slate-500">File size ({fileExt.toUpperCase()})</div>
              </div>
              <div className="rounded-lg bg-slate-50 border border-slate-100 p-2">
                <div className="text-base font-bold tabular-nums text-govNavy-900">{text.length.toLocaleString()}</div>
                <div className="text-[10px] text-slate-500">Characters extracted</div>
              </div>
              <div className="rounded-lg bg-slate-50 border border-slate-100 p-2">
                <div className="text-base font-bold tabular-nums text-govNavy-900">{Math.round(text.length / fileKb)}/KB</div>
                <div className="text-[10px] text-slate-500">Text coverage density</div>
              </div>
              <div className="rounded-lg bg-slate-50 border border-slate-100 p-2">
                <div className="text-base font-bold tabular-nums text-govNavy-900">
                  {(validation?.matched_standards?.length ?? validation?.cited.length ?? 0)}
                </div>
                <div className="text-[10px] text-slate-500">Standards detected</div>
              </div>
            </div>
            {fileExt === 'pdf' && fileKb > 50 && text.length / fileKb < 60 && (
              <div className="mt-3 rounded-lg border border-amber-300 bg-amber-50 p-3 text-xs text-amber-900">
                <strong>Scanned-document warning:</strong> very little selectable text was found for
                this PDF size — it may be scanned or image-only. Detected references and matches
                may be incomplete; prefer a text-based export where possible.
              </div>
            )}
          </div>

          {validation && (
            <div className="bg-white border border-slate-200 rounded-xl p-4 shadow-sm space-y-3">
              <h4 className="text-sm font-bold text-slate-800">
                Detected standards ({cited.length || validation.cited.length})
              </h4>
              {cited.length > 0 ? (
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                  {cited.map((m) => (
                    <Link
                      key={m.is_number}
                      href={getStandardDetailUrl(m.is_number)}
                      className="flex items-center justify-between gap-2 bg-slate-50 border border-slate-200 hover:border-blue-400 rounded-lg px-3 py-2 text-xs"
                    >
                      <span className="font-mono font-bold text-govNavy-900">{m.is_number}</span>
                      <span className="text-slate-500 truncate flex-1" title={m.title}>{m.title}</span>
                      <ExternalLink className="w-3 h-3 text-slate-400 shrink-0" />
                    </Link>
                  ))}
                </div>
              ) : (
                <p className="text-xs text-slate-500">
                  Cited refs: {(validation.cited as unknown as string[]).join?.(', ') || 'none found'}.
                  No corpus dossiers matched — verify designations on the BIS portal.
                </p>
              )}
              {highIssues.length > 0 && (
                <div className="bg-red-50 border border-red-200 rounded-lg p-3 text-xs space-y-1.5">
                  <p className="font-bold text-red-800 flex items-center gap-1.5">
                    <AlertTriangle className="w-4 h-4" />
                    <span>{highIssues.length} critical citation defect(s)</span>
                  </p>
                  {highIssues.map((iss, i) => (
                    <p key={i} className="text-red-900">
                      <strong>{iss.is_number}:</strong> {iss.issue} → {iss.action}
                    </p>
                  ))}
                  <Link href="/validator" className="text-blue-700 hover:underline font-semibold inline-block pt-1">
                    Open full audit in Tender Validator →
                  </Link>
                </div>
              )}
            </div>
          )}

          {recommendations.length > 0 && (
            <div className="space-y-4">
              <h4 className="text-sm font-bold text-govNavy-900">
                Clause matches ({recommendations.length})
              </h4>
              {recommendations.map((rec) => (
                <div key={rec.is_number} className="space-y-1">
                  <RecommendationCard rec={rec} query={text.slice(0, 500)} />
                  <Link
                    href={getStandardDetailUrl(rec.is_number)}
                    className="text-[11px] text-blue-700 hover:underline font-medium inline-flex items-center gap-1 ml-1"
                  >
                    <StatusChip status={rec.status} />
                    <span>Open dossier for {rec.is_number} →</span>
                  </Link>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
