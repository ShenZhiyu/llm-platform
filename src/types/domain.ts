export type Role = string;
export type Model = string;

export type User = {
  id: string;
  name: string;
  department: string;
  role: Role;
  ip: string;
  isActive?: boolean;
};

export type Citation = {
  id: string;
  documentId: string;
  knowledgeBaseId: string;
  title: string;
  knowledgeBaseName: string;
  similarity: number;
  excerpt: string;
};

export type ChatMessage = {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  reasoning?: string | null;
  model?: Model;
  responseTimeMs?: number;
  firstTokenLatencyMs?: number;
  inputTokens?: number;
  outputTokens?: number;
  tokensPerSecond?: number;
  createdAt: string;
  citations?: Citation[];
  imageDataUrls?: string[];
  attachments?: ChatAttachment[];
  feedback?: 'like' | 'dislike' | null;
  feedbackReason?: string | null;
  feedbackUpdatedAt?: string | null;
  editedAt?: string | null;
  regeneratedAt?: string | null;
};

export type ChatAttachment = {
  id: string;
  title: string;
  fileName: string;
  indexStatus: string;
};

export type ChatSession = {
  id: string;
  userId?: string;
  title: string;
  model: Model;
  updatedAt: string;
  archivedAt?: string | null;
  temperature?: number;
  topP?: number;
  maxTokens?: number;
  recentMessageLimit?: number;
  showThinking?: boolean;
  enableThinking?: boolean;
  selectedKnowledgeBaseIds?: string[];
  attachedDocumentIds?: string[];
  attachedDocuments?: ChatAttachment[];
  messages: ChatMessage[];
};

export type KnowledgeBase = {
  id: string;
  name: string;
  department: string;
  level: string;
  fileCount: number;
  status: string;
  updatedAt: string;
  role: string;
  type: string;
};

export type KnowledgeDocument = {
  id: string;
  knowledgeBaseId: string;
  title: string;
  fileName: string;
  status: string;
  securityResult: string;
  applicant: string;
  submittedAt: string;
  summary: string;
  storagePath?: string | null;
  mimeType?: string | null;
  fileSize?: number;
  contentHash?: string | null;
  indexStatus?: string;
  chunkCount?: number;
  indexedAt?: string | null;
  indexError?: string | null;
};

export type KnowledgeSearchResult = {
  chunkId: string;
  documentId: string;
  knowledgeBaseId: string;
  title: string;
  knowledgeBaseName: string;
  similarity: number;
  excerpt: string;
  pageLabel?: string | null;
};

export type Approval = {
  id: string;
  type: string;
  applicant: string;
  target: string;
  status: string;
  risk: string;
  createdAt: string;
  relatedDocumentId?: string | null;
};

export type AuditLog = {
  id: string;
  time: string;
  user: string;
  role: Role;
  action: string;
  resource: string;
  ip: string;
  risk: 'normal' | 'warning' | 'danger';
  detail: string;
};

export type ModelConfig = {
  id: string;
  name: Model | 'DeepSeek R1' | string;
  type: string;
  status: string;
  isDefault: boolean;
  endpoint: string;
};

export type ApiKey = {
  id: string;
  name: string;
  caller: string;
  expiry: string;
  limit: string;
  status: string;
  createdAt: string;
  scopes?: string;
  lastUsedAt?: string | null;
  callCount?: number;
  secret?: string;
};

export type NotificationMessage = {
  id: string;
  userId?: string | null;
  title: string;
  content: string;
  category: string;
  readAt?: string | null;
  createdAt: string;
};

export type LLMTask = {
  id: string;
  userId?: string | null;
  taskType: string;
  title: string;
  inputText: string;
  outputText: string;
  model: string;
  status: string;
  inputTokens: number;
  outputTokens: number;
  createdAt: string;
};

export type OpsStatus = {
  database: string;
  llmGateway: string;
  knowledgeIndex: string;
  uploadStorage: string;
  auditCount: number;
  pendingApprovals: number;
  indexedDocuments: number;
  failedDocuments: number;
  recentErrors: string[];
};

export type ReportSummary = {
  chatSessions: number;
  chatMessages: number;
  inputTokens: number;
  outputTokens: number;
  knowledgeBases: number;
  documents: number;
  approvalsPending: number;
  approvalsApproved: number;
  approvalsRejected: number;
  modelFailures: number;
};
