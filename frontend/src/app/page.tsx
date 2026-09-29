'use client';

import React, { useState, useRef, useEffect } from 'react';
import { Search, Sparkles, FileUp, Download, Loader2, RefreshCw, Building2, Globe } from 'lucide-react';
import { recommendStandards, extractDocumentText, fetchSampleTenders, fetchDivisions } from '@/lib/api';
import { logHistory } from '@/lib/history';
import { Recommendation, ProcurementTender } from '@/lib/types';
import RecommendationCard from '@/components/RecommendationCard';
import VoiceRecorder from '@/components/VoiceRecorder';

const PRESET_QUERIES = [
  {
    icon: '⚡',
    label: '3-Core Armoured Cable',
    text: '3 core armoured copper cable for underground LV power distribution up to 1100V',
  },
  {
    icon: '🏗️',
    label: '43 Grade Cement (Superseded)',
    text: '43 grade ordinary portland cement for RCC foundation construction',
  },
  {
    icon: '🔩',
    label: 'TMT Fe 500 Steel Bars',
    text: 'High strength deformed steel bars Fe 500 grade for concrete reinforcement',
  },
  {
    icon: '🔌',
    label: 'Distribution Transformers',
    text: 'Outdoor type three phase oil immersed distribution transformers up to 2500 kVA',
  },
];

const DIVISIONS = ['All Divisions', 'ETD', 'CED', 'MTD'];

export default function SearchPage() {
  const [query, setQuery] = useState('');
  const [topK, setTopK] = useState(5);
  const [division, setDivision] = useState('All Divisions');
  const [loading, setLoading] = useState(false);
  const [stageMessage, setStageMessage] = useState('');
  const [results, setResults] = useState<Recommendation[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [extractingDoc, setExtractingDoc] = useState(false);
  const [detectedLanguage, setDetectedLanguage] = useState<string | null>(null);
  const [normalizedQuery, setNormalizedQuery] = useState<string | null>(null);
  const [sampleTenders, setSampleTenders] = useState<ProcurementTender[]>([]);
  const [showTenders, setShowTenders] = useState(false);
  const [corpusStats, setCorpusStats] = useState<{ total: number; enriched: number; divisions: number } | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const autoRanRef = useRef(false);

  useEffect(() => {
    fetchSampleTenders()
      .then(setSampleTenders)
      .catch(() => {});
    fetchDivisions()
      .then((res) => setCorpusStats({
        total: res.total,
        enriched: res.divisions.reduce((n, d) => n + d.enriched, 0),
        divisions: res.divisions.length,
      }))
      .catch(() => {});
  }, []);

  const handleSearch = async (overrideQuery?: string) => {
    const q = (overrideQuery ?? query).trim();
    if (!q) return;

    setLoading(true);
    setError(null);
    setResults(null);
    setDetectedLanguage(null);
    setNormalizedQuery(null);

    try {
      setStageMessage('Stage 1/3: Normalizing specification & computing dense/sparse embeddings...');
      await new Promise((r) => setTimeout(r, 120));

      setStageMessage('Stage 2/3: Traversing citation graph for normative closure & allied roles...');
      await new Promise((r) => setTimeout(r, 120));

      setStageMessage('Stage 3/3: Formulating tender compliance clauses & evaluating certification rules...');

      const res = await recommendStandards(q, topK, division);
      setDetectedLanguage(res.detected_language || null);
      setNormalizedQuery(res.normalized_query || null);

      if (res.state === 'low_confidence' || !res.recommendations?.length) {
        setError(res.message || 'No confident match found. Please include more specific technical attributes.');
        setResults([]);
      } else {
        setResults(res.recommendations);
        try {
          logHistory('query', q, `${res.recommendations.length} matches`, `/?q=${encodeURIComponent(q)}`);
        } catch { /* history is non-critical */ }
      }
    } catch (err: any) {
      setError(err.message || 'Search failed. Please try again.');
    } finally {
      setLoading(false);
      setStageMessage('');
    }
  };

  const handlePreset = (presetText: string) => {
    setQuery(presetText);
    handleSearch(presetText);
  };

  // History rerun (?q=…): prefill and search once on mount. Guarded for StrictMode.
  useEffect(() => {
    if (autoRanRef.current) return;
    autoRanRef.current = true;
    try {
      const q = new URLSearchParams(window.location.search).get('q');
      if (q && q.trim()) {
        setQuery(q);
        handleSearch(q);
      }
    } catch { /* ignore */ }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleSelectTender = (tender: ProcurementTender) => {
    const spec = tender.raw_specification || tender.title;
    setQuery(spec);
    handleSearch(spec);
  };

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const lowerName = file.name.toLowerCase();
    const validExtensions = ['.pdf', '.docx', '.txt'];
    const isValid = validExtensions.some((ext) => lowerName.endsWith(ext));

    if (!isValid) {
      setError('Please upload a valid document (.pdf, .docx, or .txt).');
      if (fileInputRef.current) fileInputRef.current.value = '';
      return;
    }

    if (file.size > 20 * 1024 * 1024) {
      setError('File size exceeds the 20 MB limit.');
      if (fileInputRef.current) fileInputRef.current.value = '';
      return;
    }

    setExtractingDoc(true);
    setError(null);

    try {
      const data = await extractDocumentText(file);
      if (data.text) {
        setQuery(data.text);
      } else {
        setError('No readable text found in this document. The file may be empty or contain only images.');
      }
    } catch (err: any) {
      setError(err?.message || 'Failed to extract text from document.');
    } finally {
      setExtractingDoc(false);
      if (fileInputRef.current) {
        fileInputRef.current.value = '';
      }
    }
  };

  const downloadJson = () => {
    if (!results) return;
    const blob = new Blob([JSON.stringify({ query, recommendations: results }, null, 2)], {
      type: 'application/json',
    });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `is_sarthi_recommendation_${Date.now()}.json`;
    a.click();
  };

  const downloadMarkdown = () => {
    if (!results) return;
    const lines = [`# IS Sarthi Recommendation Report`, `Query: ${query}\n`];
    results.forEach((r) => {
      lines.push(`## ${r.is_number}: ${r.title}`);
      lines.push(`- Status: ${r.status.toUpperCase()}`);
      lines.push(`- Current Edition: ${r.latest_version}`);
      if (r.superseded_by) lines.push(`- Consolidated into: ${r.superseded_by}`);
      if (r.amendments?.length) {
        lines.push(`- Amendments: ${r.amendments.map((a) => `Amdt ${a.number} (${a.date || ''})`).join(', ')}`);
      }
      lines.push(`- Confidence: ${r.band} (${r.confidence.toFixed(3)})`);
      lines.push(`- Scope Justification: ${r.justification}`);
      if (r.certification) {
        lines.push(`- Mandatory Certification Scheme: ${r.certification.scheme_label || r.certification.scheme}`);
      }
      if (r.tender_clause) {
        lines.push(`\n### Tender Specification Clause:\n\`\`\`\n${r.tender_clause}\n\`\`\`\n`);
      }
      lines.push('\n---\n');
    });

    const blob = new Blob([lines.join('\n')], { type: 'text/markdown' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `is_sarthi_report_${Date.now()}.md`;
    a.click();
  };

  return (
    <div className="space-y-6">
      <div className="relative overflow-hidden rounded-2xl bg-gradient-to-br from-govNavy-950 via-govNavy-900 to-govNavy-700 text-white shadow-lift">
        <div className="hero-grid pointer-events-none absolute inset-0" aria-hidden />
        <div className="pointer-events-none absolute -right-20 -top-24 h-64 w-64 rounded-full bg-govSaffron-500/20 blur-3xl" aria-hidden />
        <div className="relative px-5 py-7 sm:px-8 sm:py-9">
          <p className="inline-flex items-center gap-1.5 rounded-full border border-white/20 bg-white/10 px-2.5 py-1 text-[11px] font-bold uppercase tracking-[0.12em] text-govSaffron-400">
            <Sparkles className="h-3.5 w-3.5" aria-hidden />
            Recommendation console
          </p>
          <h2 className="mt-3 max-w-2xl text-2xl font-bold leading-tight tracking-tight sm:text-3xl">
            Find the right Indian Standard for every procurement
          </h2>
          <p className="mt-2 max-w-2xl text-sm leading-relaxed text-slate-300">
            Describe the product or paste a specification — the engine returns primary standards,
            allied test methods, current editions, and mandatory certification rules.
          </p>
          {corpusStats && (
            <dl className="mt-5 flex flex-wrap gap-x-8 gap-y-3">
              <div>
                <dt className="text-[11px] font-medium uppercase tracking-wider text-slate-400">Standards indexed</dt>
                <dd className="text-xl font-bold tabular-nums text-white">{corpusStats.total.toLocaleString()}</dd>
              </div>
              <div>
                <dt className="text-[11px] font-medium uppercase tracking-wider text-slate-400">Enriched dossiers</dt>
                <dd className="text-xl font-bold tabular-nums text-white">{corpusStats.enriched.toLocaleString()}</dd>
              </div>
              <div>
                <dt className="text-[11px] font-medium uppercase tracking-wider text-slate-400">BIS divisions</dt>
                <dd className="text-xl font-bold tabular-nums text-white">{corpusStats.divisions}</dd>
              </div>
            </dl>
          )}
        </div>
      </div>

      {/* Preset Chips */}
      <div>
        <p className="eyebrow mb-2 flex items-center gap-1.5">
          <Sparkles className="h-3.5 w-3.5 text-govSaffron-500" aria-hidden />
          Quick example queries — click to load
        </p>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-2">
          {PRESET_QUERIES.map((p) => (
            <button
              key={p.label}
              type="button"
              onClick={() => handlePreset(p.text)}
              className="card card-hover p-2.5 text-left text-xs group"
            >
              <span className="font-semibold text-slate-800 group-hover:text-blue-900 flex items-center gap-1.5">
                <span>{p.icon}</span>
                <span>{p.label}</span>
              </span>
            </button>
          ))}
        </div>
      </div>

      {/* Procurement Portal Integration (GeM Adapter Feed) */}
      {sampleTenders.length > 0 && (
        <div className="card !bg-slate-50/70 p-3.5">
          <div className="flex items-center justify-between mb-2">
            <span className="text-xs font-bold text-govNavy-900 flex items-center gap-1.5">
              <Building2 className="w-4 h-4 text-govSaffron-500" />
              <span>Government e-Marketplace (GeM) Tender Connector:</span>
            </span>
            <button
              type="button"
              onClick={() => setShowTenders(!showTenders)}
              className="link text-xs"
            >
              {showTenders ? 'Hide Sample GeM Bids' : `Explore ${sampleTenders.length} Verified Public GeM Bids`}
            </button>
          </div>
          {showTenders && (
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5 pt-1">
              {sampleTenders.map((t) => (
                <div
                  key={t.tender_id}
                  onClick={() => handleSelectTender(t)}
                  className="card card-hover p-2.5 cursor-pointer text-xs"
                >
                  <div className="flex items-center justify-between text-[10px] text-slate-500 font-mono">
                    <span className="font-bold text-govNavy-900">{t.tender_id}</span>
                    <span>{t.portal || 'GeM'}</span>
                  </div>
                  <div className="font-semibold text-slate-800 mt-1 line-clamp-1">{t.title}</div>
                  <div className="text-[11px] text-slate-500 mt-0.5">{t.organization}</div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Voice Dictation (Sarvam AI STT) */}
      <VoiceRecorder onTranscribe={(text) => setQuery(text)} />

      {/* Specification Input Form */}
      <div className="card-pad shadow-lift space-y-4">
        <div>
          <div className="flex items-center justify-between mb-1.5">
            <label className="field-label sm:text-sm" htmlFor="spec-input">
              Product Description or Technical Specification
            </label>
            <label
              className={`flex items-center gap-1 text-xs font-medium transition-colors ${
                extractingDoc ? 'text-slate-400 cursor-not-allowed' : 'text-blue-700 hover:text-blue-800 cursor-pointer'
              }`}
            >
              {extractingDoc ? (
                <Loader2 className="w-3.5 h-3.5 animate-spin text-blue-600" />
              ) : (
                <FileUp className="w-3.5 h-3.5" />
              )}
              <span>{extractingDoc ? 'Extracting Document...' : 'Upload Document (PDF, DOCX, TXT)'}</span>
              <input
                ref={fileInputRef}
                type="file"
                accept=".pdf,.docx,.txt,application/pdf,application/vnd.openxmlformats-officedocument.wordprocessingml.document,text/plain"
                onChange={handleFileUpload}
                disabled={extractingDoc}
                className="hidden"
              />
            </label>
          </div>
          <textarea
            id="spec-input"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            rows={4}
            placeholder="e.g. 3 core armoured copper conductor XLPE insulated cable for working voltages up to 1100 V... Or type in Hindi/Marathi"
            className="input min-h-[104px] resize-y p-3 !text-sm"
          />
        </div>

        {/* Multilingual Query Translation Notification Banner */}
        {detectedLanguage && detectedLanguage !== 'en-IN' && normalizedQuery && (
          <div className="bg-indigo-50 border border-indigo-200 text-indigo-950 rounded-lg p-2.5 text-xs flex items-center gap-2">
            <Globe className="w-4 h-4 text-indigo-600 shrink-0" />
            <span>
              Query translated from <strong>{detectedLanguage === 'hi-IN' ? 'Hindi (हिन्दी)' : detectedLanguage === 'mr-IN' ? 'Marathi (मराठी)' : detectedLanguage}</strong> to English technical representation for retrieval: <em>"{normalizedQuery}"</em>
            </span>
          </div>
        )}

        {/* Filter Row & Submit Button */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pt-1">
          <div className="flex items-center gap-4">
            <div className="flex items-center gap-2 text-xs">
              <span className="text-slate-600 font-medium">Max Results:</span>
              <select
                value={topK}
                onChange={(e) => setTopK(Number(e.target.value))}
                className="bg-slate-50 border border-slate-300 rounded px-2.5 py-1.5 text-xs text-slate-800 font-medium"
              >
                <option value={3}>3 Standards</option>
                <option value={5}>5 Standards</option>
                <option value={8}>8 Standards</option>
                <option value={10}>10 Standards</option>
              </select>
            </div>

            <div className="flex items-center gap-2 text-xs">
              <span className="text-slate-600 font-medium">Division:</span>
              <select
                value={division}
                onChange={(e) => setDivision(e.target.value)}
                className="bg-slate-50 border border-slate-300 rounded px-2.5 py-1.5 text-xs text-slate-800 font-medium"
              >
                {DIVISIONS.map((d) => (
                  <option key={d} value={d}>
                    {d}
                  </option>
                ))}
              </select>
            </div>
          </div>

          <button
            type="button"
            onClick={() => handleSearch()}
            disabled={loading || !query.trim()}
            className="btn-primary"
          >
            {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Search className="w-4 h-4 text-govSaffron-400" />}
            <span>Find Standards & Allied Norms</span>
          </button>
        </div>

        {/* Staged Pipeline Progress */}
        {loading && stageMessage && (
          <div className="bg-blue-50 border border-blue-200 rounded-lg p-3 text-xs text-blue-800 flex items-center gap-2 animate-pulse">
            <RefreshCw className="w-4 h-4 animate-spin text-blue-600" />
            <span>{stageMessage}</span>
          </div>
        )}
      </div>

      {/* Error / Warning Alert */}
      {error && (
        <div className="bg-amber-50 border border-amber-300 text-amber-900 p-4 rounded-xl text-sm">
          ⚠️ {error}
        </div>
      )}

      {/* Results Section */}
      {results && results.length > 0 && (
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <h3 className="section-title !text-base">
              Recommendations <span className="font-medium text-slate-400">({results.length} surfaced)</span>
            </h3>
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={downloadJson}
                className="flex items-center gap-1 bg-white hover:bg-slate-50 border border-slate-200 text-slate-700 text-xs px-2.5 py-1 rounded shadow-sm font-medium"
              >
                <Download className="w-3.5 h-3.5" />
                <span>JSON</span>
              </button>
              <button
                type="button"
                onClick={downloadMarkdown}
                className="flex items-center gap-1 bg-white hover:bg-slate-50 border border-slate-200 text-slate-700 text-xs px-2.5 py-1 rounded shadow-sm font-medium"
              >
                <Download className="w-3.5 h-3.5" />
                <span>Markdown</span>
              </button>
            </div>
          </div>

          <div className="space-y-4">
            {results.map((rec) => (
              <RecommendationCard key={rec.is_number} rec={rec} query={query} />
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
