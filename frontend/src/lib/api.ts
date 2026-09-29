import {
  RecommendResponse,
  ValidateResponse,
  StandardsCatalogResponse,
  StandardDetail,
  GraphResponse,
  TranscribeResponse,
  SynthesizeResponse,
  ExtractDocumentResponse,
  ExtractPdfResponse,
  ProcurementTender,
  ProcurementIngestResponse,
  AssistantChatResponse,
  ChatTurn,
  DivisionsResponse,
  SummaryResponse,
  ReverseRefsResponse,
  ReviewQueueResponse,
} from './types';

const API_BASE = '/api';

export async function fetchHealth(): Promise<{ status: string; standards_indexed: number; voice_enabled: boolean }> {
  const res = await fetch(`${API_BASE}/health`);
  if (!res.ok) throw new Error('Failed to fetch API health');
  return res.json();
}

export function getStandardDetailUrl(is_number: string): string {
  if (!is_number) return '/standards';
  return `/standards?is_number=${encodeURIComponent(is_number.trim())}`;
}

export async function fetchStandardDetail(is_number: string): Promise<StandardDetail> {
  const trimmed = is_number.trim();
  const encoded = encodeURIComponent(trimmed);

  // 1. Try query parameter endpoint (completely slash-safe across all HTTP proxies)
  let res: Response | null = null;
  try {
    res = await fetch(`${API_BASE}/standards/detail?is_number=${encoded}`);
  } catch {
    res = null;
  }

  // 2. Fallback to path endpoint
  if (!res || !res.ok) {
    try {
      res = await fetch(`${API_BASE}/standards/${encoded}`);
    } catch {
      res = null;
    }
  }

  if (!res || !res.ok) {
    const err = res ? await res.json().catch(() => ({ detail: `Standard '${trimmed}' not found` })) : { detail: `Standard '${trimmed}' not found` };
    throw new Error(err.detail || `Standard '${trimmed}' not found`);
  }
  return res.json();
}


export async function recommendStandards(
  query: string,
  top_k: number = 5,
  division?: string
): Promise<RecommendResponse> {
  const res = await fetch(`${API_BASE}/recommend`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ query, top_k, division: division === 'All Divisions' ? null : division }),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({ detail: 'Recommendation failed' }));
    throw new Error(err.detail || 'Recommendation request failed');
  }
  return res.json();
}

export async function validateSpecification(spec_text: string): Promise<ValidateResponse> {
  const res = await fetch(`${API_BASE}/validate`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ spec_text }),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({ detail: 'Validation failed' }));
    throw new Error(err.detail || 'Validation request failed');
  }
  return res.json();
}

export async function fetchStandards(
  division?: string,
  search?: string,
  opts?: { status?: string; qcoOnly?: boolean; sort?: string; limit?: number; offset?: number }
): Promise<StandardsCatalogResponse> {
  const params = new URLSearchParams();
  if (division && division !== 'All') params.append('division', division);
  if (search) params.append('search', search);
  if (opts?.status && opts.status !== 'All') params.append('status', opts.status);
  if (opts?.qcoOnly) params.append('qco', 'true');
  if (opts?.sort) params.append('sort', opts.sort);
  if (opts?.limit != null) params.append('limit', String(opts.limit));
  if (opts?.offset) params.append('offset', String(opts.offset));

  const res = await fetch(`${API_BASE}/standards?${params.toString()}`);
  if (!res.ok) throw new Error('Failed to load standards catalog');
  return res.json();
}

export async function fetchDivisions(): Promise<DivisionsResponse> {
  const res = await fetch(`${API_BASE}/divisions`);
  if (!res.ok) throw new Error('Failed to load division rollup');
  return res.json();
}

export async function fetchStandardGraph(is_number: string, depth: number = 1): Promise<GraphResponse> {
  const trimmed = is_number.trim();
  const encoded = encodeURIComponent(trimmed);

  // 1. Try query parameter endpoint
  let res: Response | null = null;
  try {
    res = await fetch(`${API_BASE}/standards/graph?is_number=${encoded}&depth=${depth}`);
  } catch {
    res = null;
  }

  // 2. Fallback to path endpoint
  if (!res || !res.ok) {
    try {
      res = await fetch(`${API_BASE}/standards/${encoded}/graph?depth=${depth}`);
    } catch {
      res = null;
    }
  }

  if (!res || !res.ok) throw new Error(`Failed to load dependency graph for ${trimmed}`);
  return res.json();
}

export async function transcribeAudio(audioBlob: Blob, language_code: string = 'auto'): Promise<TranscribeResponse> {
  const formData = new FormData();
  formData.append('file', audioBlob, 'recording.wav');
  formData.append('language_code', language_code);

  const res = await fetch(`${API_BASE}/speech/transcribe`, {
    method: 'POST',
    body: formData,
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({ detail: 'Transcription failed' }));
    throw new Error(err.detail || 'Speech transcription failed');
  }
  return res.json();
}

export async function synthesizeSpeech(text: string, language_code: string = 'hi-IN'): Promise<SynthesizeResponse> {
  const res = await fetch(`${API_BASE}/speech/synthesize`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ text, language_code }),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({ detail: 'Speech synthesis failed' }));
    throw new Error(err.detail || 'Speech synthesis failed');
  }
  return res.json();
}

export async function submitFeedback(is_number: string, verdict: 'relevant' | 'irrelevant', query?: string) {
  const res = await fetch(`${API_BASE}/feedback`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ is_number, verdict, query }),
  });
  return res.ok;
}

export async function extractDocumentText(file: File): Promise<ExtractDocumentResponse> {
  const formData = new FormData();
  formData.append('file', file);

  const res = await fetch(`${API_BASE}/extract-document`, {
    method: 'POST',
    body: formData,
  });

  if (!res.ok) {
    const err = await res.json().catch(() => ({ detail: 'Failed to extract text from document' }));
    throw new Error(err.detail || 'Failed to extract text from document');
  }

  return res.json();
}

export async function extractPdfText(file: File): Promise<ExtractPdfResponse> {
  return extractDocumentText(file);
}

export async function fetchSampleTenders(): Promise<ProcurementTender[]> {
  const res = await fetch(`${API_BASE}/procurement/sample-tenders`);
  if (!res.ok) throw new Error('Failed to load sample procurement tenders');
  return res.json();
}

export async function ingestProcurementTender(
  tender_id_or_data: any,
  portal: string = 'gem'
): Promise<ProcurementIngestResponse> {
  const res = await fetch(`${API_BASE}/procurement/ingest`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ tender_id_or_data, portal }),
  });

  if (!res.ok) {
    const err = await res.json().catch(() => ({ detail: 'Procurement tender ingestion failed' }));
    throw new Error(err.detail || 'Procurement tender ingestion failed');
  }

  return res.json();
}

export async function askAssistant(
  message: string,
  history: ChatTurn[] = [],
  top_k: number = 5
): Promise<AssistantChatResponse> {  const res = await fetch(`${API_BASE}/assistant/chat`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ message, history: history.slice(-10), top_k }),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({ detail: 'Assistant request failed' }));
    throw new Error(err.detail || 'Assistant request failed');
  }
  return res.json();
}

export async function summarizeStandard(
  is_number: string,
  query?: string
): Promise<SummaryResponse> {  const res = await fetch(`${API_BASE}/summarize`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ is_number, query }),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({ detail: 'Summary request failed' }));
    throw new Error(err.detail || 'Summary request failed');
  }
  return res.json();
}

export async function fetchCitedBy(is_number: string, limit: number = 20): Promise<ReverseRefsResponse> {
  const res = await fetch(
    `${API_BASE}/standards/graph/reverse?is_number=${encodeURIComponent(is_number)}&limit=${limit}`
  );
  if (!res.ok) throw new Error(`No citing standards found for ${is_number}`);
  return res.json();
}

export async function fetchReviewQueue(status: string = 'pending', limit: number = 50): Promise<ReviewQueueResponse> {
  const res = await fetch(`${API_BASE}/review-queue?status=${encodeURIComponent(status)}&limit=${limit}`);
  if (!res.ok) throw new Error('Failed to load review queue');
  return res.json();
}
