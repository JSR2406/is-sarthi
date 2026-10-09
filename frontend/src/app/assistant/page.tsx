'use client';

import React, { useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import {
  MessageCircle, Send, Loader2, ExternalLink, Sparkles, RotateCcw,
  Globe, History, Trash2, X,
} from 'lucide-react';
import { askAssistant, getStandardDetailUrl } from '@/lib/api';
import { logHistory } from '@/lib/history';
import {
  ChatSession, StoredChatMessage,
  deleteChatSession, listChatSessions, saveChatSession,
} from '@/lib/chatHistory';
import PageHeader from '@/components/PageHeader';
import { ChatTurn, AssistantChatResponse, AssistantWebSource } from '@/lib/types';

type DisplayMsg = StoredChatMessage;

const QUICK_PROMPTS = [
  'Which standard applies to 3-core armoured copper cable for 1100V underground laying?',
  'Is IS 8112 still valid for 43 grade cement, or has it been superseded?',
  'What allied test methods should my cable tender cite?',
  'Which certification is mandatory for LED lamps procured by a municipality?',
];

export default function AssistantPage() {
  const [messages, setMessages] = useState<DisplayMsg[]>([]);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // null = auto (server decides per query); true/false = force on/off.
  const [webMode, setWebMode] = useState<boolean | null>(null);
  // Conversation memory: active session id + persisted session list.
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [sessions, setSessions] = useState<ChatSession[]>([]);
  const [historyOpen, setHistoryOpen] = useState(false);
  const bottomRef = useRef<HTMLDivElement>(null);

  // Hydrate session list (and last session) from localStorage after mount.
  useEffect(() => {
    const stored = listChatSessions();
    setSessions(stored);
    if (stored.length > 0) {
      setSessionId(stored[0].id);
      setMessages(stored[0].messages);
    }
  }, []);

  const persistSession = (next: DisplayMsg[], id: string | null): string => {
    const savedId = saveChatSession(next, id);
    setSessionId(savedId);
    setSessions(listChatSessions());
    return savedId;
  };

  const send = async (override?: string) => {
    const text = (override ?? input).trim();
    if (!text || loading) return;
    setError(null);
    const userMsg: DisplayMsg = { role: 'user', content: text, ts: Date.now() };
    const base = [...messages, userMsg];
    // Prior turns only (exclude the new user message) — server resolves follow-ups.
    const history: ChatTurn[] = messages
      .slice(-10)
      .filter((m) => m.role === 'user' || m.role === 'assistant')
      .map((m) => ({ role: m.role, content: m.content }));
    setMessages(base);
    setInput('');
    setLoading(true);
    try {
      const res = await askAssistant(text, history, 5, { useWeb: webMode });
      const assistantMsg: DisplayMsg = {
        role: 'assistant',
        content: res.answer,
        citations: res.citations,
        webSources: res.web_sources ?? [],
        webUsed: res.web_used ?? false,
        followups: res.suggested_followups,
        state: res.state,
        ts: Date.now(),
      };
      const next = [...base, assistantMsg];
      setMessages(next);
      persistSession(next, sessionId);
      try {
        const extras: string[] = [];
        if (res.citations.length) extras.push(`${res.citations.length} citations`);
        if (res.web_used) extras.push('web context');
        if (res.followup_resolved) extras.push('follow-up resolved');
        logHistory('chat', text.slice(0, 120), extras.join(' · ') || undefined, '/assistant');
      } catch { /* history is non-critical */ }
    } catch (err: any) {
      setError(err.message || 'Assistant request failed. Try again.');
      persistSession(base, sessionId);
    } finally {
      setLoading(false);
      setTimeout(() => bottomRef.current?.scrollIntoView({ behavior: 'smooth' }), 100);
    }
  };

  const reset = () => {
    if (messages.length > 0) persistSession(messages, sessionId);
    setMessages([]);
    setSessionId(null);
    setError(null);
    setInput('');
  };

  const resumeSession = (s: ChatSession) => {
    if (messages.length > 0) persistSession(messages, sessionId);
    setSessionId(s.id);
    setMessages(s.messages);
    setError(null);
    setHistoryOpen(false);
    setTimeout(() => bottomRef.current?.scrollIntoView({ behavior: 'smooth' }), 50);
  };

  const removeSession = (id: string) => {
    deleteChatSession(id);
    setSessions(listChatSessions());
    if (sessionId === id) {
      setSessionId(null);
      setMessages([]);
    }
  };

  const activeTitle = sessions.find((s) => s.id === sessionId)?.title;

  return (
    <div className="space-y-6">
      <PageHeader
        icon={MessageCircle}
        eyebrow="Grounded Q&A"
        title="Standards Assistant (Manak AI)"
        description="Ask in plain language — English, Hindi, or Marathi. Every answer is grounded in retrieved BIS standards with citations. Toggle Web for live Tavily-backed context (QCO updates, amendments, news) shown as separate sources. Conversations are remembered on this device."
        actions={
          <>
            <button
              type="button"
              onClick={() => setHistoryOpen((o) => !o)}
              className="btn-secondary"
              aria-expanded={historyOpen}
            >
              <History className="w-3.5 h-3.5" />
              <span>History{sessions.length > 0 ? ` (${sessions.length})` : ''}</span>
            </button>
            {messages.length > 0 && (
              <button
                type="button"
                onClick={reset}
                className="btn-secondary"
              >
                <RotateCcw className="w-3.5 h-3.5" />
                <span>New chat</span>
              </button>
            )}
          </>
        }
      />

      {historyOpen && (
        <div className="bg-white border border-slate-200 rounded-xl shadow-sm p-3">
          <div className="flex items-center justify-between pb-2">
            <p className="text-[11px] font-bold uppercase tracking-wider text-slate-400">
              Conversation history — stored on this device only
            </p>
            <button
              type="button"
              onClick={() => setHistoryOpen(false)}
              className="text-slate-400 hover:text-slate-600"
              aria-label="Close history"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
          {sessions.length === 0 ? (
            <p className="text-xs text-slate-400 py-3">No saved conversations yet.</p>
          ) : (
            <ul className="space-y-1.5 max-h-56 overflow-y-auto">
              {sessions.map((s) => (
                <li
                  key={s.id}
                  className={`flex items-center gap-2 rounded-lg border px-2.5 py-2 text-xs ${
                    s.id === sessionId
                      ? 'border-blue-300 bg-blue-50/60'
                      : 'border-slate-200 hover:border-blue-300 bg-white'
                  }`}
                >
                  <button
                    type="button"
                    onClick={() => resumeSession(s)}
                    className="flex-1 min-w-0 text-left"
                  >
                    <span className="block font-semibold text-slate-800 truncate" title={s.title}>
                      {s.title}
                    </span>
                    <span className="block text-[10px] text-slate-400">
                      {new Date(s.updated_at).toLocaleString(undefined, {
                        day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit',
                      })}
                      {' · '}{s.messages.filter((m) => m.role === 'user').length} message(s)
                    </span>
                  </button>
                  <button
                    type="button"
                    onClick={() => removeSession(s.id)}
                    className="text-slate-300 hover:text-red-500 p-1"
                    aria-label={`Delete conversation: ${s.title}`}
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}

      {messages.length === 0 && (
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
          {QUICK_PROMPTS.map((p) => (
            <button
              key={p}
              type="button"
              onClick={() => send(p)}
              className="text-left bg-white border border-slate-200 hover:border-blue-400 hover:bg-blue-50/50 p-3 rounded-lg shadow-sm transition-all text-xs text-slate-700"
            >
              <span className="font-semibold text-slate-800 flex items-center gap-1.5">
                <Sparkles className="w-3.5 h-3.5 text-govSaffron-500" />
                <span className="line-clamp-2">{p}</span>
              </span>
            </button>
          ))}
        </div>
      )}

      <div className="bg-white border border-slate-200 rounded-xl shadow-sm min-h-[320px] max-h-[520px] overflow-y-auto p-4 space-y-4">
        {activeTitle && (
          <p className="text-[11px] text-slate-400 border-b border-slate-100 pb-2">
            Resumed conversation: <span className="font-medium text-slate-500">{activeTitle}</span>
          </p>
        )}
        {messages.length === 0 && !loading && (
          <div className="flex h-64 flex-col items-center justify-center gap-2 px-4 text-center">
            <MessageCircle className="h-10 w-10 text-slate-300" aria-hidden />
            <p className="text-sm font-semibold text-slate-600">Ask about any product, material, or tender clause</p>
            <p className="max-w-sm text-xs text-slate-400">
              e.g. “Which IS standard governs XLPE cables up to 1100V?”
            </p>
          </div>
        )}
        {messages.map((m, i) => (
          <div key={i} className={`flex ${m.role === 'user' ? 'justify-end' : 'justify-start'}`}>
            <div
              className={`max-w-[85%] rounded-xl px-3.5 py-2.5 text-sm leading-relaxed ${
                m.role === 'user'
                  ? 'bg-govNavy-900 text-white whitespace-pre-wrap'
                  : 'bg-white text-slate-800 border border-slate-200 shadow-soft w-full'
              }`}
            >
              {m.role === 'assistant' ? (
                <div className="space-y-2.5">
                  <p className="whitespace-pre-wrap">{m.content}</p>
                  {m.state && m.state !== 'ok' && (
                    <p className="rounded-lg border border-amber-300 bg-amber-50 p-2.5 text-xs text-amber-900">
                      <strong>Low-confidence answer:</strong> the corpus has no strong match for
                      this question. Treat the above as a starting point and verify against the
                      cited dossiers before citing in procurement.
                    </p>
                  )}
                  {m.citations && m.citations.length > 0 && (
                    <div className="rounded-lg border border-slate-100 bg-slate-50/70 p-2">
                      <p className="px-1 pb-1.5 text-[11px] font-bold uppercase tracking-wider text-slate-400">
                        Source citations ({m.citations.length})
                      </p>
                      <div className="space-y-1.5">
                        {m.citations.map((c, ci) => (
                          <Link
                            key={c.is_number}
                            href={getStandardDetailUrl(c.is_number)}
                            className="flex items-center justify-between gap-2 bg-white border border-slate-200 hover:border-blue-400 rounded-lg px-2.5 py-1.5 text-xs"
                          >
                            <span className="flex items-center gap-1.5 font-mono font-bold text-govNavy-900">
                              <span className="flex h-4 w-4 items-center justify-center rounded-full bg-blue-100 text-[9px] text-blue-800">{ci + 1}</span>
                              {c.is_number}
                            </span>
                            <span className="text-slate-500 truncate flex-1" title={c.title}>
                              {c.title}
                            </span>
                            <span className="text-[10px] font-semibold text-blue-700 bg-blue-50 px-1.5 py-0.5 rounded">
                              {c.band ?? c.status}
                            </span>
                            <ExternalLink className="w-3 h-3 text-slate-400 shrink-0" />
                          </Link>
                        ))}
                      </div>
                    </div>
                  )}
                  {m.webSources && m.webSources.length > 0 && (
                    <div className="rounded-lg border border-blue-100 bg-blue-50/50 p-2">
                      <p className="px-1 pb-1.5 text-[11px] font-bold uppercase tracking-wider text-blue-500 flex items-center gap-1">
                        <Globe className="w-3 h-3" />
                        Live web sources ({m.webSources.length}) — verify before citing
                      </p>
                      <div className="space-y-1.5">
                        {m.webSources.map((w, wi) => (
                          <a
                            key={`${w.url}-${wi}`}
                            href={w.url}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="flex items-center justify-between gap-2 bg-white border border-blue-100 hover:border-blue-400 rounded-lg px-2.5 py-1.5 text-xs"
                          >
                            <span className="flex items-center gap-1.5 font-semibold text-blue-900">
                              <span className="flex h-4 w-4 items-center justify-center rounded-full bg-blue-600 text-[9px] text-white">W{wi + 1}</span>
                              <span className="line-clamp-1 max-w-[220px]" title={w.title}>{w.title || w.url}</span>
                            </span>
                            <ExternalLink className="w-3 h-3 text-slate-400 shrink-0" />
                          </a>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              ) : (
                <>{m.content}</>
              )}
              {m.role === 'assistant' && m.followups && m.followups.length > 0 && (
                <div className="mt-2 flex flex-wrap gap-1.5">
                  {m.followups.map((f) => (
                    <button
                      key={f}
                      type="button"
                      onClick={() => send(f)}
                      className="text-[11px] bg-white border border-blue-200 text-blue-800 hover:bg-blue-50 px-2 py-1 rounded-full font-medium"
                    >
                      {f}
                    </button>
                  ))}
                </div>
              )}
            </div>
          </div>
        ))}
        {loading && (
          <div className="flex justify-start">
            <div className="bg-slate-100 border border-slate-200 rounded-xl px-3.5 py-2.5 text-sm text-slate-500 flex items-center gap-2">
              <Loader2 className="w-4 h-4 animate-spin text-blue-600" />
              <span>Retrieving standards and grounding answer…</span>
            </div>
          </div>
        )}
        <div ref={bottomRef} />
      </div>

      {error && (
        <div className="bg-red-50 border border-red-300 text-red-900 p-3 rounded-xl text-sm">
          ⚠️ {error}
        </div>
      )}

      <div className="bg-white border border-slate-200 rounded-xl p-3 shadow-sm flex items-center gap-2">
        <button
          type="button"
          title={webMode === null ? 'Web search: auto' : webMode ? 'Web search: on' : 'Web search: off'}
          onClick={() => setWebMode((m) => (m === null ? true : m === true ? false : null))}
          className={`flex items-center gap-1.5 px-2.5 py-2 rounded-lg text-xs font-semibold border shrink-0 ${
            webMode === null
              ? 'bg-slate-100 border-slate-300 text-slate-600'
              : webMode
                ? 'bg-blue-600 border-blue-600 text-white'
                : 'bg-white border-slate-300 text-slate-400'
          }`}
        >
          <Globe className="w-3.5 h-3.5" />
          <span className="hidden sm:inline">{webMode === null ? 'Web auto' : webMode ? 'Web on' : 'Web off'}</span>
        </button>
        <input
          type="text"
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') send();
          }}
          placeholder="Ask e.g. Which IS standard governs XLPE cables up to 1100V?"
          className="flex-1 border border-slate-300 rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-600 text-slate-900 placeholder:text-slate-400"
        />
        <button
          type="button"
          onClick={() => send()}
          disabled={loading || !input.trim()}
          className="flex items-center gap-1.5 bg-govNavy-900 hover:bg-govNavy-800 text-white font-semibold px-4 py-2.5 rounded-lg text-sm disabled:opacity-50"
        >
          {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
          <span className="hidden sm:inline">Ask</span>
        </button>
      </div>
    </div>
  );
}
