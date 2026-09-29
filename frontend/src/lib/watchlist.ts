'use client';

/** Watchlist: standards under surveillance, stored on-device.
 *  Re-check compares a live dossier snapshot (status, year, amendment count,
 *  validity) against the saved snapshot and reports changed/unchanged.
 *  Fully grounded — diffs are computed field-by-field from fetched dossiers.
 */
import { fetchStandardDetail } from './api';

export interface WatchSnapshot {
  status: string;
  year?: number | null;
  amendments: number;
  valid_upto?: string | null;
  superseded_by?: string | null;
}

export interface WatchEntry {
  is_number: string;
  title?: string;
  added_at: number;
  snapshot: WatchSnapshot;
  last_check?: { at: number; changed: boolean; changes: string[] };
}

const KEY = 'is_sarthi_watchlist_v1';
const MAX = 100;

function read(): WatchEntry[] {
  try {
    const raw = localStorage.getItem(KEY);
    const parsed = raw ? JSON.parse(raw) : [];
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function write(entries: WatchEntry[]): void {
  try {
    localStorage.setItem(KEY, JSON.stringify(entries.slice(0, MAX)));
  } catch {
    /* ignore */
  }
}

export function snapshotOf(detail: any): WatchSnapshot {
  return {
    status: detail.status || 'current',
    year: detail.year ?? null,
    amendments: (detail.amendments || []).length,
    valid_upto: detail.valid_upto ?? null,
    superseded_by: detail.superseded_by ?? null,
  };
}

export function diffSnapshots(old: WatchSnapshot, cur: WatchSnapshot): string[] {
  const changes: string[] = [];
  if (old.status !== cur.status) changes.push(`status: ${old.status} → ${cur.status}`);
  if ((old.year ?? null) !== (cur.year ?? null)) changes.push(`edition year: ${old.year ?? '—'} → ${cur.year ?? '—'}`);
  if (old.amendments !== cur.amendments)
    changes.push(`amendments: ${old.amendments} → ${cur.amendments}`);
  if ((old.valid_upto ?? null) !== (cur.valid_upto ?? null))
    changes.push(`valid upto: ${old.valid_upto ?? '—'} → ${cur.valid_upto ?? '—'}`);
  if ((old.superseded_by ?? null) !== (cur.superseded_by ?? null))
    changes.push(`successor: ${old.superseded_by ?? '—'} → ${cur.superseded_by ?? '—'}`);
  return changes;
}

export function getWatchlist(): WatchEntry[] {
  return read();
}

export function isWatched(is_number: string): boolean {
  return read().some((e) => e.is_number === is_number);
}

export function toggleWatch(is_number: string, title?: string, detail?: any): boolean {
  const entries = read();
  if (entries.some((e) => e.is_number === is_number)) {
    write(entries.filter((e) => e.is_number !== is_number));
    return false;
  }
  const snapshot: WatchSnapshot = detail
    ? snapshotOf(detail)
    : { status: 'unknown', amendments: 0 };
  write([{ is_number, title, added_at: Date.now(), snapshot }, ...entries]);
  return true;
}

export async function recheckWatch(entry: WatchEntry): Promise<WatchEntry> {
  const detail = await fetchStandardDetail(entry.is_number);
  const cur = snapshotOf(detail);
  const changes = diffSnapshots(entry.snapshot, cur);
  const updated: WatchEntry = {
    ...entry,
    title: detail.title || entry.title,
    snapshot: cur,
    last_check: { at: Date.now(), changed: changes.length > 0, changes },
  };
  const entries = read().map((e) => (e.is_number === entry.is_number ? updated : e));
  write(entries);
  return updated;
}
