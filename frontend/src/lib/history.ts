'use client';

/** Session history (localStorage) for query rerun, uploads, audits, chats, opens.
 *  Best-effort and privacy-light: stores query text the user typed on this
 *  device only. Never sent anywhere except as the link the user clicks.
 */
export type HistoryKind = 'query' | 'audit' | 'upload' | 'chat' | 'open' | 'compare';

export interface HistoryEntry {
  id: string;
  ts: number;
  kind: HistoryKind;
  label: string;
  detail?: string;
  href?: string;
  bookmarked?: boolean;
}

const KEY = 'is_sarthi_history_v1';
const MAX = 100;

export function logHistory(kind: HistoryKind, label: string, detail?: string, href?: string): void {
  try {
    const existing = getHistory();
    const entry: HistoryEntry = {
      id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      ts: Date.now(),
      kind,
      label: label.slice(0, 200),
      detail: detail?.slice(0, 200),
      href,
    };
    localStorage.setItem(KEY, JSON.stringify([entry, ...existing].slice(0, MAX)));
  } catch {
    /* storage unavailable — history is non-critical */
  }
}

export function getHistory(): HistoryEntry[] {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

export function clearHistory(): void {
  try {
    localStorage.removeItem(KEY);
  } catch {
    /* ignore */
  }
}

export function toggleBookmark(id: string): boolean {
  try {
    const entries = getHistory();
    const entry = entries.find((e) => e.id === id);
    if (!entry) return false;
    entry.bookmarked = !entry.bookmarked;
    localStorage.setItem(KEY, JSON.stringify(entries.slice(0, MAX)));
    return entry.bookmarked === true;
  } catch {
    return false;
  }
}

export function getBookmarked(): HistoryEntry[] {
  return getHistory().filter((e) => e.bookmarked);
}
