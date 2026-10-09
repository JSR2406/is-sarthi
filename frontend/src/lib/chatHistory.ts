'use client';

/**
 * Persistent chat sessions for the Standards Assistant (localStorage).
 *
 * Privacy-light by design: conversation text stays on this device only,
 * mirroring history.ts. Each session keeps the full message list (citations,
 * web sources, follow-ups) so a conversation can be resumed later.
 */
import { ChatTurn, AssistantCitation, AssistantWebSource } from './types';

export interface StoredChatMessage extends ChatTurn {
  citations?: AssistantCitation[];
  webSources?: AssistantWebSource[];
  webUsed?: boolean;
  followups?: string[];
  state?: string;
  ts?: number;
}

export interface ChatSession {
  id: string;
  title: string;
  created_at: number;
  updated_at: number;
  messages: StoredChatMessage[];
}

const KEY = 'is_sarthi_chat_sessions_v1';
const MAX_SESSIONS = 30;
const MAX_MESSAGES_PER_SESSION = 120;

export function listChatSessions(): ChatSession[] {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed
      .filter((s): s is ChatSession => s && typeof s.id === 'string' && Array.isArray(s.messages))
      .sort((a, b) => (b.updated_at || 0) - (a.updated_at || 0));
  } catch {
    return [];
  }
}

export function getChatSession(id: string): ChatSession | null {
  return listChatSessions().find((s) => s.id === id) ?? null;
}

function persist(sessions: ChatSession[]): void {
  try {
    const trimmed = sessions
      .sort((a, b) => (b.updated_at || 0) - (a.updated_at || 0))
      .slice(0, MAX_SESSIONS)
      .map((s) => ({
        ...s,
        messages: s.messages.slice(-MAX_MESSAGES_PER_SESSION),
      }));
    localStorage.setItem(KEY, JSON.stringify(trimmed));
  } catch {
    /* storage unavailable — history is non-critical */
  }
}

/** Title from the first user message, capped. */
function deriveTitle(messages: StoredChatMessage[]): string {
  const firstUser = messages.find((m) => m.role === 'user');
  const text = firstUser?.content?.trim() ?? 'New conversation';
  return text.length > 60 ? text.slice(0, 57) + '…' : text;
}

export function saveChatSession(messages: StoredChatMessage[], existingId?: string | null): string {
  const sessions = listChatSessions();
  const now = Date.now();
  const id = existingId ?? `${now}-${Math.random().toString(36).slice(2, 8)}`;
  const existingIndex = sessions.findIndex((s) => s.id === id);

  if (existingIndex >= 0) {
    sessions[existingIndex] = {
      ...sessions[existingIndex],
      messages,
      title: deriveTitle(messages),
      updated_at: now,
    };
  } else {
    sessions.push({
      id,
      title: deriveTitle(messages),
      created_at: now,
      updated_at: now,
      messages,
    });
  }
  persist(sessions);
  return id;
}

export function deleteChatSession(id: string): void {
  try {
    persist(listChatSessions().filter((s) => s.id !== id));
  } catch {
    /* ignore */
  }
}

export function clearAllChatSessions(): void {
  try {
    localStorage.removeItem(KEY);
  } catch {
    /* ignore */
  }
}
