'use client';

import React, { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { History as HistoryIcon, Trash2, Copy, Check, ExternalLink, Star } from 'lucide-react';
import { getHistory, clearHistory, toggleBookmark, HistoryEntry, HistoryKind } from '@/lib/history';
import { getWatchlist, recheckWatch, toggleWatch, WatchEntry } from '@/lib/watchlist';
import PageHeader from '@/components/PageHeader';
import EmptyState from '@/components/EmptyState';

const KIND_LABEL: Record<HistoryKind, string> = {
  query: 'Recommendation queries',
  audit: 'Tender audits',
  upload: 'Document uploads',
  chat: 'Assistant chats',
  open: 'Opened dossiers',
  compare: 'Comparisons',
};

export default function HistoryPage() {
  const [entries, setEntries] = useState<HistoryEntry[]>([]);
  const [kindFilter, setKindFilter] = useState<'All' | 'Saved' | HistoryKind>('All');
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [watch, setWatch] = useState<WatchEntry[]>([]);
  const [checking, setChecking] = useState(false);

  useEffect(() => {
    setEntries(getHistory());
    setWatch(getWatchlist());
  }, []);

  const filtered = kindFilter === 'All'
    ? entries
    : kindFilter === 'Saved'
    ? entries.filter((e) => e.bookmarked)
    : entries.filter((e) => e.kind === kindFilter);

  const dayLabel = (ts: number) => {
    const day = new Date(ts).toDateString();
    const today = new Date().toDateString();
    const yesterday = new Date(Date.now() - 86400000).toDateString();
    if (day === today) return 'Today';
    if (day === yesterday) return 'Yesterday';
    return new Date(ts).toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' });
  };

  const grouped = useMemo(() => {
    const groups: { label: string; items: HistoryEntry[] }[] = [];
    filtered.forEach((entry) => {
      const label = dayLabel(entry.ts);
      const group = groups.find((g) => g.label === label);
      if (group) group.items.push(entry);
      else groups.push({ label, items: [entry] });
    });
    return groups;
  }, [filtered]);

  const savedCount = entries.filter((e) => e.bookmarked).length;

  const copy = (entry: HistoryEntry) => {
    try {
      navigator.clipboard.writeText(entry.label);
      setCopiedId(entry.id);
      setTimeout(() => setCopiedId(null), 1500);
    } catch { /* ignore */ }
  };

  return (
    <div className="space-y-6">
      <PageHeader
        icon={HistoryIcon}
        eyebrow="Session recall"
        title="Search History"
        description="Previous queries, uploads, audits, chats, and opened records — stored on this device only. Rerun any recommendation query with one click."
        actions={
          entries.length > 0 ? (
            <button
              type="button"
              onClick={() => {
                clearHistory();
                setEntries([]);
              }}
              className="btn-secondary hover:!border-red-200 hover:!bg-red-50 hover:!text-red-700"
            >
              <Trash2 className="w-3.5 h-3.5" />
              <span>Clear</span>
            </button>
          ) : undefined
        }
      />

      <div className="flex items-center gap-2">
        <span className="text-xs font-semibold text-slate-600">Filter:</span>
        <select
          value={kindFilter}
          onChange={(e) => setKindFilter(e.target.value as 'All' | 'Saved' | HistoryKind)}
          className="bg-white border border-slate-300 rounded-lg px-2.5 py-1.5 text-xs font-medium"
        >
          <option value="All">All activity ({entries.length})</option>
          <option value="Saved">★ Saved ({savedCount})</option>
          {(Object.keys(KIND_LABEL) as HistoryKind[]).map((k) => (
            <option key={k} value={k}>
              {KIND_LABEL[k]} ({entries.filter((e) => e.kind === k).length})
            </option>
          ))}
        </select>
      </div>

      {watch.length > 0 && (
        <div className="card-pad">
          <div className="section-head">
            <div>
              <h3 className="section-title">Watchlist — change alerts ({watch.length})</h3>
              <p className="section-sub">Re-check compares live dossiers against saved snapshots.</p>
            </div>
            <button
              type="button"
              disabled={checking}
              onClick={async () => {
                setChecking(true);
                try {
                  const updated: WatchEntry[] = [];
                  for (const w of getWatchlist()) {
                    try {
                      updated.push(await recheckWatch(w));
                    } catch {
                      updated.push(w);
                    }
                  }
                  setWatch(updated);
                } finally {
                  setChecking(false);
                }
              }}
              className="btn-secondary"
            >
              {checking ? 'Checking…' : 'Re-check all'}
            </button>
          </div>
          <ul className="space-y-1.5">
            {watch.map((w) => (
              <li key={w.is_number} className="flex items-start justify-between gap-2 rounded-lg border border-slate-100 bg-slate-50/60 px-3 py-2 text-xs">
                <div className="min-w-0">
                  <Link href={`/standards?is_number=${encodeURIComponent(w.is_number)}`} className="font-mono font-bold text-govNavy-900 hover:underline">
                    {w.is_number}
                  </Link>
                  {w.last_check ? (
                    w.last_check.changed ? (
                      <p className="mt-0.5 font-semibold text-amber-700">
                        Changed: {w.last_check.changes.join(' · ')}
                      </p>
                    ) : (
                      <p className="mt-0.5 text-emerald-700">Unchanged since save.</p>
                    )
                  ) : (
                    <p className="mt-0.5 text-slate-400">Not checked yet.</p>
                  )}
                </div>
                <button
                  type="button"
                  onClick={() => {
                    toggleWatch(w.is_number);
                    setWatch(getWatchlist());
                  }}
                  className="shrink-0 text-[11px] font-semibold text-slate-400 hover:text-red-600"
                >
                  Remove
                </button>
              </li>
            ))}
          </ul>
        </div>
      )}

      {filtered.length === 0 ? (
        <EmptyState
          icon={HistoryIcon}
          title="No history yet"
          body="Run a recommendation, audit a tender, chat with the assistant, or open a dossier — activity will appear here for rerun."
          action={
            <Link
              href="/"
              className="btn-primary"
            >
              Start with a recommendation
            </Link>
          }
        />
      ) : (
        <div className="space-y-5">
          {grouped.map((group) => (
            <div key={group.label}>
              <p className="eyebrow mb-1.5 px-1">{group.label}</p>
              <div className="bg-white border border-slate-200 rounded-xl shadow-sm divide-y divide-slate-100">
                {group.items.map((entry) => (
            <div key={entry.id} className="px-4 py-3 flex items-start justify-between gap-3">
              <div className="min-w-0">
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="text-[10px] font-bold uppercase tracking-wider bg-slate-100 text-slate-600 px-1.5 py-0.5 rounded">
                    {entry.kind}
                  </span>
                  <span className="text-[11px] text-slate-400">
                    {new Date(entry.ts).toLocaleString()}
                  </span>
                </div>
                <p className="text-sm text-slate-800 mt-1 break-words">{entry.label}</p>
                {entry.detail && <p className="text-[11px] text-slate-500 mt-0.5">{entry.detail}</p>}
              </div>
              <div className="flex items-center gap-1.5 shrink-0">
                <button
                  type="button"
                  onClick={() => {
                    toggleBookmark(entry.id);
                    setEntries(getHistory());
                  }}
                  title={entry.bookmarked ? 'Remove bookmark' : 'Bookmark this entry'}
                  className={`p-2 rounded-md border transition-colors ${
                    entry.bookmarked
                      ? 'border-amber-300 bg-amber-50 text-amber-600'
                      : 'border-slate-200 hover:bg-slate-50 text-slate-400'
                  }`}
                >
                  <Star className={`w-3.5 h-3.5 ${entry.bookmarked ? 'fill-amber-400 text-amber-500' : ''}`} />
                </button>
                <button
                  type="button"
                  onClick={() => copy(entry)}
                  title="Copy text"
                  className="p-2 rounded-md border border-slate-200 hover:bg-slate-50 text-slate-500"
                >
                  {copiedId === entry.id ? <Check className="w-3.5 h-3.5 text-emerald-600" /> : <Copy className="w-3.5 h-3.5" />}
                </button>
                {entry.href && (
                  <Link
                    href={entry.href}
                    className="p-1.5 rounded-md border border-blue-200 bg-blue-50 hover:bg-blue-100 text-blue-700 text-xs font-semibold inline-flex items-center gap-1"
                    title={entry.kind === 'query' ? 'Rerun query' : 'Open'}
                  >
                    <ExternalLink className="w-3.5 h-3.5" />
                    <span>{entry.kind === 'query' ? 'Rerun' : 'Open'}</span>
                  </Link>
                )}
              </div>
            </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
