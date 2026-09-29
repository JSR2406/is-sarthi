export type CertificationScheme = 'ISI' | 'CRS' | 'Hallmarking' | string;

export interface Certification {
  scheme?: CertificationScheme;
  scheme_label?: string;
  mandatory?: boolean;
  product?: string;
  details?: string;
}

export interface Amendment {
  number: string;
  date?: string | null;
}

export type AlliedRole =
  | 'Test method'
  | 'Related product'
  | 'Terminology'
  | 'Safety'
  | 'Installation'
  | 'Sampling'
  | 'Dimensions'
  | string;

export interface AlliedItem {
  is_number: string;
  title: string;
  status?: string;
  ref_type?: string;
  role?: AlliedRole;
  hop?: number;
  relevance?: number;
}

export interface Recommendation {
  is_number: string;
  title: string;
  status: 'current' | 'superseded' | 'withdrawn' | 'under_revision' | string;
  superseded_by?: string | null;
  latest_version: string;
  confidence: number;
  band: 'High' | 'Medium' | 'Low';
  justification: string;
  certification?: Certification | null;
  amendments?: Amendment[];
  allied?: Record<string, AlliedItem[]>;
  tender_clause?: string;
  tier?: 'enriched' | 'catalogue';
  is_enriched?: boolean;
  canonical_key?: string;
  department?: string;
  department_name?: string;
  aspect?: string;
  published_on?: string;
  valid_upto?: string;
  title_hindi?: string;
  scope?: string;
  signals?: {
    dense_rank?: number | null;
    sparse_rank?: number | null;
  };
}

export interface RecommendResponse {
  query: string;
  state: 'ok' | 'low_confidence' | 'error';
  message?: string;
  recommendations: Recommendation[];
  normalized_query?: string;
  detected_language?: string;
}

export interface AuditIssue {
  is_number: string;
  severity: 'high' | 'medium' | 'low' | 'info' | string;
  issue: string;
  action: string;
}

export interface SuggestedAddition {
  is_number: string;
  title?: string;
  role: string;
  referenced_by: string;
}

export interface MatchedStandard {
  is_number: string;
  canonical_key?: string;
  title?: string;
  tier?: 'enriched' | 'catalogue';
  status?: string;
  department?: string;
}

export interface ValidateResponse {
  cited: string[];
  standards_checked?: number;
  valid_standards?: number;
  issues: AuditIssue[];
  suggested_additions: SuggestedAddition[];
  matched_standards?: MatchedStandard[];
  completeness?: {
    score: number;
    grade: string;
    detail: string;
  };
}

export interface StandardDetail {
  is_number: string;
  canonical_key?: string;
  sources?: string[];
  title: string;
  title_hindi?: string | null;
  year?: number | null;
  status: 'current' | 'superseded' | 'withdrawn' | 'under_revision' | string;
  division?: string;
  department?: string;
  department_name?: string | null;
  scope?: string;
  normative_references?: string[];
  amendments?: Amendment[];
  certification?: Certification | null;
  superseded_by?: string | null;
  published_on?: string | null;
  valid_upto?: string | null;
  aspect?: string | null;
  degree_of_equivalence?: string | null;
  tier?: 'enriched' | 'catalogue';
  is_enriched?: boolean;
  tender_clause?: string;
  allied_by_role?: Record<string, AlliedItem[]>;
}

export interface StandardCatalogItem {
  is_number: string;
  title: string;
  division: string;
  department_name?: string | null;
  aspect?: string | null;
  year?: number;
  status: string;
  mandatory_qco: boolean;
  certification?: Certification;
  tier?: 'enriched' | 'catalogue';
  is_enriched?: boolean;
}

export interface StandardsCatalogResponse {
  total: number;
  limit?: number | null;
  offset?: number;
  standards: StandardCatalogItem[];
}

export interface DivisionStat {
  division: string;
  total: number;
  current: number;
  enriched: number;
  qco: number;
  outdated: number;
}

export interface AspectStat {
  aspect: string;
  total: number;
}

export interface DepartmentStat {
  name: string;
  alias: string | null;
  total: number;
}

export interface DivisionsResponse {
  total: number;
  divisions: DivisionStat[];
  aspects?: AspectStat[];
  statuses?: Record<string, number>;
  departments?: DepartmentStat[];
}

export interface GraphNode {
  id: string;
  label: string;
  title: string;
  status: string;
  division: string;
  tier?: 'enriched' | 'catalogue' | string;
  is_target: boolean;
}

export interface GraphEdge {
  source: string;
  target: string;
  role: string;
  kind?: 'normative' | 'cited_by' | 'similar' | string;
}

export interface GraphResponse {
  target: string;
  nodes: GraphNode[];
  edges: GraphEdge[];
}

export interface TranscribeResponse {
  transcript: string;
  detected_language: string;
}

export interface SynthesizeResponse {
  text: string;
  language_code: string;
  audio_base64: string;
}

export interface ExtractDocumentResponse {
  text: string;
  filename: string;
  character_count: number;
  format?: string;
}

export type ExtractPdfResponse = ExtractDocumentResponse;

export interface ProcurementTender {
  tender_id: string;
  title: string;
  portal?: string;
  organization?: string;
  reference_number?: string;
  closing_date?: string | null;
  category?: string;
  raw_specification?: string;
  line_items?: Array<{ item: string; quantity: string } | string>;
  metadata?: Record<string, any>;
}

export interface ProcurementIngestResponse {
  tender: {
    tender_id: string;
    title: string;
    portal: string;
    organization: string;
    normalized_query: string;
    technical_parameters?: Record<string, any>;
    cited_standards?: string[];
    raw_specification?: string;
  };
  recommendations: Recommendation[];
  state: 'ok' | 'low_confidence' | 'error';
  query_used: string;
  validation?: ValidateResponse | null;
}

export interface ChatTurn {
  role: 'user' | 'assistant';
  content: string;
}

export interface AssistantCitation {
  is_number: string;
  title?: string;
  tier?: string;
  status?: string;
  confidence?: number;
  band?: string;
}

export interface AssistantChatResponse {
  answer: string;
  citations: AssistantCitation[];
  suggested_followups: string[];
  state: 'ok' | 'low_confidence' | 'error';
  message?: string;
  query: string;
  normalized_query?: string;
  detected_language?: string;
  recommendations: Recommendation[];
}

export interface SummaryResponse {
  is_number: string;
  summary: string[];
  facts: string[];
  notice: string | null;
}

export interface CitedByEntry {
  is_number: string;
  title?: string;
  role: string;
  status?: string;
}

export interface ReverseRefsResponse {
  is_number: string;
  cited_by_count: number;
  cited_by: CitedByEntry[];
}

export interface ReviewQueueItem {
  id: string;
  canonical_key?: string | null;
  reason: string;
  confidence?: number | null;
  status: string;
  created_at?: string;
}

export interface ReviewQueueResponse {
  status: string;
  total: number;
  items: ReviewQueueItem[];
  notice?: string;
}
