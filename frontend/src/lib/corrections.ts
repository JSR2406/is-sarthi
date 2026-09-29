'use client';

/** Manual-correction outbox: reviewer-suggested fixes queued on-device.
 *  Nothing is applied silently — entries export as JSON for an admin to
 *  review and ingest through the Phase-2 pipeline review workflow.
 */
export interface Correction {
  id: string;
  is_number: string;
  field: string;
  message: string;
  created_at: number;
}

const KEY = 'is_sarthi_corrections_v1';
const MAX = 200;

export function getCorrections(): Correction[] {
  try {
    const raw = localStorage.getItem(KEY);
    const parsed = raw ? JSON.parse(raw) : [];
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

export function saveCorrection(is_number: string, field: string, message: string): Correction {
  const entry: Correction = {
    id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    is_number,
    field,
    message: message.slice(0, 1000),
    created_at: Date.now(),
  };
  try {
    const existing = getCorrections();
    localStorage.setItem(KEY, JSON.stringify([entry, ...existing].slice(0, MAX)));
  } catch {
    /* ignore */
  }
  return entry;
}

export function clearCorrections(): void {
  try {
    localStorage.removeItem(KEY);
  } catch {
    /* ignore */
  }
}

export function exportCorrections(): void {
  const blob = new Blob([JSON.stringify(getCorrections(), null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `is_sarthi_corrections_${Date.now()}.json`;
  a.click();
  URL.revokeObjectURL(url);
}
