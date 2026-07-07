import type {
  ApiKey,
  Approval,
  AuditLog,
  ChatMessage,
  ChatSession,
  KnowledgeBase,
  KnowledgeDocument,
  KnowledgeSearchResult,
  LLMTask,
  Model,
  ModelConfig,
  NotificationMessage,
  OpsStatus,
  ReportSummary,
  User,
  WritingDocument,
  WritingFormatConfig,
  WritingTemplate,
  WritingTemplateField,
} from '../types/domain';

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL ?? 'http://127.0.0.1:18080/api/v1';
const API_ORIGIN = API_BASE_URL.replace(/\/api\/v1\/?$/, '');
const TOKEN_KEY = 'llm-platform:token';

type BackendCitation = {
  id: string;
  documentId: string;
  knowledgeBaseId: string;
  title: string;
  knowledgeBaseName: string;
  similarity: number;
  excerpt: string;
};

type BackendMessage = {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  reasoning?: string | null;
  model?: string | null;
  responseTimeMs?: number;
  firstTokenLatencyMs?: number;
  inputTokens?: number;
  outputTokens?: number;
  tokensPerSecond?: number;
  createdAt: string;
  citations?: BackendCitation[];
  imageDataUrls?: string[];
  attachments?: {
    id: string;
    title: string;
    fileName: string;
    indexStatus: string;
  }[];
  feedback?: 'like' | 'dislike' | null;
  feedbackReason?: string | null;
  feedbackUpdatedAt?: string | null;
  editedAt?: string | null;
  regeneratedAt?: string | null;
};

type BackendSession = {
  id: string;
  userId?: string;
  title: string;
  model: string;
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
  attachedDocuments?: {
    id: string;
    title: string;
    fileName: string;
    indexStatus: string;
  }[];
  messages: BackendMessage[];
};

type ChatOptions = {
  temperature?: number;
  topP?: number;
  maxTokens?: number;
  recentMessageLimit?: number;
  showThinking?: boolean;
  enableThinking?: boolean;
  knowledgeBaseIds?: string[];
  attachedDocumentIds?: string[];
  imageDataUrls?: string[];
};

type ChatStreamHandlers = {
  onStart?: (userMessage: ChatMessage, assistantMessage: ChatMessage) => void;
  onContent?: (messageId: string, delta: string) => void;
  onReasoning?: (messageId: string, delta: string) => void;
};

type ContextUsage = {
  usedTokens: number;
  maxTokens: number;
  percent: number;
  model: string;
  messageCount: number;
  source: string;
};

type LoginResponse = {
  user: User;
  token: string;
  expiresAt: string;
};

function getToken() {
  return window.localStorage.getItem(TOKEN_KEY);
}

function setToken(token: string | null) {
  if (token) window.localStorage.setItem(TOKEN_KEY, token);
  else window.localStorage.removeItem(TOKEN_KEY);
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const token = getToken();
  const response = await fetch(`${API_BASE_URL}${path}`, {
    ...init,
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...(init?.headers ?? {}),
    },
  });
  if (!response.ok) {
    const detail = await response.text();
    throw new Error(`Backend request failed: ${response.status} ${detail}`);
  }
  if (response.status === 204) return undefined as T;
  return response.json() as Promise<T>;
}

async function uploadForm<T>(path: string, form: FormData): Promise<T> {
  const token = getToken();
  const response = await fetch(`${API_BASE_URL}${path}`, {
    method: 'POST',
    headers: token ? { Authorization: `Bearer ${token}` } : undefined,
    body: form,
  });
  if (!response.ok) throw new Error(await response.text());
  return response.json() as Promise<T>;
}

function toBackendModel(model: Model): string {
  return model;
}

function toFrontendModel(model?: string | null): Model {
  return model || 'Qwen3-30B-A3B-w8a8';
}

function mapMessage(message: BackendMessage): ChatMessage {
  return {
    id: message.id,
    role: message.role,
    content: message.content,
    reasoning: message.reasoning ?? null,
    model: message.model ? toFrontendModel(message.model) : undefined,
    responseTimeMs: message.responseTimeMs ?? 0,
    firstTokenLatencyMs: message.firstTokenLatencyMs ?? 0,
    inputTokens: message.inputTokens ?? 0,
    outputTokens: message.outputTokens ?? 0,
    tokensPerSecond: message.tokensPerSecond ?? 0,
    createdAt: message.createdAt,
    citations: message.citations ?? [],
    imageDataUrls: message.imageDataUrls ?? [],
    attachments: message.attachments ?? [],
    feedback: message.feedback ?? null,
    feedbackReason: message.feedbackReason ?? null,
    feedbackUpdatedAt: message.feedbackUpdatedAt ?? null,
    editedAt: message.editedAt ?? null,
    regeneratedAt: message.regeneratedAt ?? null,
  };
}

function mapSession(session: BackendSession): ChatSession {
  return {
    id: session.id,
    userId: session.userId,
    title: session.title,
    model: toFrontendModel(session.model),
    updatedAt: session.updatedAt,
    archivedAt: session.archivedAt ?? null,
    temperature: session.temperature ?? 0.2,
    topP: session.topP ?? 0.9,
    maxTokens: session.maxTokens ?? 2048,
    recentMessageLimit: session.recentMessageLimit ?? 8,
    showThinking: session.showThinking ?? true,
    enableThinking: session.enableThinking ?? true,
    selectedKnowledgeBaseIds: session.selectedKnowledgeBaseIds ?? [],
    attachedDocumentIds: session.attachedDocumentIds ?? [],
    attachedDocuments: session.attachedDocuments ?? [],
    messages: session.messages.map(mapMessage),
  };
}

export const backendApi = {
  setToken,

  async login(username: string, password: string) {
    const result = await request<LoginResponse>('/auth/login', {
      method: 'POST',
      body: JSON.stringify({ username, password }),
    });
    setToken(result.token);
    return result.user;
  },

  async logout() {
    await request<{ ok: boolean }>('/auth/logout', { method: 'POST', body: JSON.stringify({}) });
    setToken(null);
  },

  async me() {
    return request<User>('/auth/me');
  },

  async listUsers() {
    return request<User[]>('/users');
  },

  async listRoles() {
    return request<{ id: string; name: string; description: string }[]>('/users/roles');
  },

  async updateUser(userId: string, payload: { roleId?: string; isActive?: boolean }) {
    return request<User>(`/users/${userId}`, { method: 'PATCH', body: JSON.stringify(payload) });
  },

  async listModels() {
    return request<ModelConfig[]>('/models');
  },

  async listApiKeys() {
    return request<ApiKey[]>('/api-keys');
  },

  async createApiKey(payload: { name: string; caller: string; scopes?: string; expiry?: string; limit?: string }) {
    return request<ApiKey>('/api-keys', { method: 'POST', body: JSON.stringify(payload) });
  },

  async revokeApiKey(apiKeyId: string) {
    return request<ApiKey>(`/api-keys/${apiKeyId}/revoke`, { method: 'POST', body: JSON.stringify({}) });
  },

  async listAuditLogs() {
    return request<AuditLog[]>('/audits');
  },

  async listApprovals(scope?: 'my' | 'todo') {
    return request<Approval[]>(`/approvals${scope ? `?scope=${encodeURIComponent(scope)}` : ''}`);
  },

  async decideApproval(approvalId: string, approved: boolean, operatorId = 'u-1001') {
    return request<Approval>(`/approvals/${approvalId}/decision`, {
      method: 'POST',
      body: JSON.stringify({ approved, operatorId }),
    });
  },

  async listKnowledgeBases() {
    return request<KnowledgeBase[]>('/knowledge-bases');
  },

  async createKnowledgeBase(payload: { name: string; department: string; level: string; type: string }) {
    return request<KnowledgeBase>('/knowledge-bases', { method: 'POST', body: JSON.stringify(payload) });
  },

  async getKnowledgeBase(knowledgeBaseId: string) {
    return request<KnowledgeBase>(`/knowledge-bases/${knowledgeBaseId}`);
  },

  async listDocuments() {
    return request<KnowledgeDocument[]>('/documents');
  },

  async searchKnowledgeBase(knowledgeBaseId: string, query: string, documentIds: string[] = [], topK = 4) {
    return request<KnowledgeSearchResult[]>(`/knowledge-bases/${knowledgeBaseId}/search`, {
      method: 'POST',
      body: JSON.stringify({ query, documentIds, topK }),
    });
  },

  async requestKnowledgeBaseAccess(knowledgeBaseId: string, userId: string, reason: string) {
    return request(`/knowledge-bases/${knowledgeBaseId}/access-requests`, {
      method: 'POST',
      body: JSON.stringify({ knowledgeBaseId, userId, reason }),
    });
  },

  async uploadDocument(file: File, knowledgeBaseId: string, applicant: string, indexNow = false) {
    const form = new FormData();
    form.append('file', file);
    form.append('knowledgeBaseId', knowledgeBaseId);
    form.append('applicant', applicant);
    form.append('indexNow', String(indexNow));
    return uploadForm<KnowledgeDocument>('/documents/upload', form);
  },

  async indexDocument(documentId: string) {
    return request<KnowledgeDocument>(`/documents/${documentId}/index`, { method: 'POST', body: JSON.stringify({}) });
  },

  async listChatSessions() {
    const sessions = await request<BackendSession[]>('/chat/sessions');
    return sessions.map(mapSession);
  },

  async createChatSession(model: Model) {
    const session = await request<BackendSession>('/chat/sessions', {
      method: 'POST',
      body: JSON.stringify({ model: toBackendModel(model), title: '新的对话' }),
    });
    return mapSession(session);
  },

  async listArchivedChatSessions() {
    const sessions = await request<BackendSession[]>('/chat/sessions/archived');
    return sessions.map(mapSession);
  },

  async archiveChatSession(sessionId: string) {
    const session = await request<BackendSession>(`/chat/sessions/${sessionId}`, { method: 'DELETE' });
    return mapSession(session);
  },

  async restoreChatSession(sessionId: string) {
    const session = await request<BackendSession>(`/chat/sessions/${sessionId}/restore`, { method: 'POST', body: JSON.stringify({}) });
    return mapSession(session);
  },

  async hardDeleteChatSession(sessionId: string) {
    await request<void>(`/chat/sessions/${sessionId}/hard-delete`, { method: 'DELETE' });
  },

  async hardDeleteAllArchivedChatSessions() {
    await request<void>('/chat/sessions/archived', { method: 'DELETE' });
  },

  async updateChatSessionSettings(sessionId: string, payload: Partial<ChatOptions> & { model?: Model }) {
    const session = await request<BackendSession>(`/chat/sessions/${sessionId}/settings`, {
      method: 'PATCH',
      body: JSON.stringify({
        model: payload.model ? toBackendModel(payload.model) : undefined,
        temperature: payload.temperature,
        topP: payload.topP,
        maxTokens: payload.maxTokens,
        recentMessageLimit: payload.recentMessageLimit,
        showThinking: payload.showThinking,
        enableThinking: payload.enableThinking,
        selectedKnowledgeBaseIds: payload.knowledgeBaseIds,
        attachedDocumentIds: payload.attachedDocumentIds,
      }),
    });
    return mapSession(session);
  },

  async uploadSessionAttachment(sessionId: string, file: File) {
    const form = new FormData();
    form.append('file', file);
    return uploadForm<{ documentId: string; title: string; fileName: string; indexStatus: string }>(`/chat/sessions/${sessionId}/attachments`, form);
  },

  async removeSessionAttachment(sessionId: string, documentId: string) {
    const session = await request<BackendSession>(`/chat/sessions/${sessionId}/attachments/${documentId}`, { method: 'DELETE' });
    return mapSession(session);
  },

  async sendMessage(sessionId: string, content: string, model: Model, user: User, options?: ChatOptions) {
    const session = await request<BackendSession>(`/chat/sessions/${sessionId}/messages`, {
      method: 'POST',
      body: JSON.stringify({
        content,
        model: toBackendModel(model),
        temperature: options?.temperature ?? 0.2,
        topP: options?.topP ?? 0.9,
        maxTokens: options?.maxTokens ?? 2048,
        recentMessageLimit: options?.recentMessageLimit ?? 8,
        showThinking: options?.showThinking ?? true,
        enableThinking: options?.enableThinking ?? true,
        knowledgeBaseIds: options?.knowledgeBaseIds ?? [],
        attachedDocumentIds: options?.attachedDocumentIds ?? [],
        imageDataUrls: options?.imageDataUrls ?? [],
      }),
    });
    return mapSession(session);
  },

  async getContextUsage(sessionId: string, content: string, model: Model, user: User, options?: ChatOptions) {
    return request<ContextUsage>(`/chat/sessions/${sessionId}/context-usage`, {
      method: 'POST',
      body: JSON.stringify({
        content,
        model: toBackendModel(model),
        temperature: options?.temperature ?? 0.2,
        topP: options?.topP ?? 0.9,
        maxTokens: options?.maxTokens ?? 2048,
        recentMessageLimit: options?.recentMessageLimit ?? 8,
        showThinking: options?.showThinking ?? true,
        enableThinking: options?.enableThinking ?? true,
        knowledgeBaseIds: options?.knowledgeBaseIds ?? [],
        attachedDocumentIds: options?.attachedDocumentIds ?? [],
        imageDataUrls: options?.imageDataUrls ?? [],
      }),
    });
  },

  async sendMessageStream(sessionId: string, content: string, model: Model, user: User, options: ChatOptions | undefined, handlers: ChatStreamHandlers) {
    const token = getToken();
    const response = await fetch(`${API_BASE_URL}/chat/sessions/${sessionId}/messages/stream`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      },
      body: JSON.stringify({
        content,
        model: toBackendModel(model),
        temperature: options?.temperature ?? 0.2,
        topP: options?.topP ?? 0.9,
        maxTokens: options?.maxTokens ?? 2048,
        recentMessageLimit: options?.recentMessageLimit ?? 8,
        showThinking: options?.showThinking ?? true,
        enableThinking: options?.enableThinking ?? true,
        knowledgeBaseIds: options?.knowledgeBaseIds ?? [],
        attachedDocumentIds: options?.attachedDocumentIds ?? [],
        imageDataUrls: options?.imageDataUrls ?? [],
      }),
    });
    if (!response.ok || !response.body) throw new Error(`Backend stream request failed: ${response.status}`);

    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    let buffer = '';
    let finalSession: ChatSession | null = null;

    const handleEvent = (rawEvent: string) => {
      const dataLine = rawEvent
        .split('\n')
        .map((line) => line.trim())
        .find((line) => line.startsWith('data:'));
      if (!dataLine) return;
      const payload = JSON.parse(dataLine.slice(5).trim()) as {
        type: string;
        message?: string;
        reason?: string;
        messageId?: string;
        delta?: string;
        userMessage?: BackendMessage;
        assistantMessage?: BackendMessage;
        session?: BackendSession;
      };
      if (payload.type === 'start' && payload.userMessage && payload.assistantMessage) handlers.onStart?.(mapMessage(payload.userMessage), mapMessage(payload.assistantMessage));
      if (payload.type === 'content' && payload.messageId && payload.delta) handlers.onContent?.(payload.messageId, payload.delta);
      if (payload.type === 'reasoning' && payload.messageId && payload.delta) handlers.onReasoning?.(payload.messageId, payload.delta);
      if (payload.type === 'done' && payload.session) finalSession = mapSession(payload.session);
      if (payload.type === 'error') throw new Error(payload.message ?? payload.reason ?? 'Backend stream failed');
    };

    while (true) {
      const { value, done } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });
      const events = buffer.split('\n\n');
      buffer = events.pop() ?? '';
      events.forEach(handleEvent);
    }
    buffer += decoder.decode();
    if (buffer.trim()) handleEvent(buffer);
    if (!finalSession) throw new Error('Backend stream ended without final session');
    return finalSession;
  },

  async listMessages(userId?: string) {
    return request<NotificationMessage[]>(`/messages${userId ? `?user_id=${encodeURIComponent(userId)}` : ''}`);
  },

  async markMessageRead(messageId: string) {
    return request<NotificationMessage>(`/messages/${messageId}/read`, { method: 'POST', body: JSON.stringify({}) });
  },

  async getOpsStatus() {
    return request<OpsStatus>('/ops/status');
  },

  async getReportSummary() {
    return request<ReportSummary>('/reports/summary');
  },

  async listLLMTasks(taskType?: string) {
    return request<LLMTask[]>(`/llm-tasks${taskType ? `?task_type=${encodeURIComponent(taskType)}` : ''}`);
  },

  async createLLMTask(payload: { taskType: string; title: string; inputText: string; userId: string; model?: string; maxTokens?: number }) {
    return request<LLMTask>('/llm-tasks', { method: 'POST', body: JSON.stringify(payload) });
  },

  async createCodeEdit(payload: {
    instruction: string;
    filePath: string;
    language: string;
    content: string;
    selectedText?: string;
    userId: string;
    model?: string;
    maxTokens?: number;
  }) {
    return request<{
      id: string;
      answer: string;
      reasoning?: string | null;
      changes: {
        filePath: string;
        operation: string;
        find: string;
        replace: string;
        description: string;
      }[];
      rawOutput: string;
      model: string;
      inputTokens: number;
      outputTokens: number;
    }>('/llm-tasks/code-edit', { method: 'POST', body: JSON.stringify(payload) });
  },

  async listWritingTemplates() {
    return request<WritingTemplate[]>('/writing/templates');
  },

  async uploadWritingTemplate(file: File, payload: { name: string; category: string; description?: string; userId: string }) {
    const form = new FormData();
    form.append('file', file);
    form.append('name', payload.name);
    form.append('category', payload.category);
    form.append('description', payload.description ?? '');
    form.append('userId', payload.userId);
    return uploadForm<WritingTemplate>('/writing/templates/upload', form);
  },

  async updateWritingTemplate(
    templateId: string,
    payload: {
      name?: string;
      category?: string;
      description?: string;
      fields?: WritingTemplateField[];
      formatConfig?: WritingFormatConfig;
      status?: string;
    },
  ) {
    return request<WritingTemplate>(`/writing/templates/${templateId}`, { method: 'PATCH', body: JSON.stringify(payload) });
  },

  async deleteWritingTemplate(templateId: string) {
    return request<void>(`/writing/templates/${templateId}`, { method: 'DELETE' });
  },

  async listWritingDocuments(userId?: string) {
    return request<WritingDocument[]>(`/writing/documents${userId ? `?user_id=${encodeURIComponent(userId)}` : ''}`);
  },

  async createWritingDocument(payload: { templateId?: string | null; userId: string; title: string; content?: Record<string, unknown>; formatConfig?: WritingFormatConfig }) {
    return request<WritingDocument>('/writing/documents', { method: 'POST', body: JSON.stringify(payload) });
  },

  async updateWritingDocument(
    documentId: string,
    payload: { title?: string; content?: Record<string, unknown>; formatConfig?: WritingFormatConfig; status?: string },
  ) {
    return request<WritingDocument>(`/writing/documents/${documentId}`, { method: 'PATCH', body: JSON.stringify(payload) });
  },

  async deleteWritingDocument(documentId: string) {
    return request<void>(`/writing/documents/${documentId}`, { method: 'DELETE' });
  },

  async generateWritingDocument(
    documentId: string,
    payload: { action: string; instruction: string; content: Record<string, unknown>; userId: string; model?: string },
  ) {
    return request<{
      document: WritingDocument;
      outputText: string;
      proofreadResults?: { id: string; type: string; original: string; suggestion: string; reason: string }[];
    }>(`/writing/documents/${documentId}/generate`, {
      method: 'POST',
      body: JSON.stringify(payload),
    });
  },

  async exportWritingDocument(documentId: string, userId: string) {
    return request<WritingDocument>(`/writing/documents/${documentId}/export`, { method: 'POST', body: JSON.stringify({ userId }) });
  },

  writingDownloadUrl(downloadUrl: string) {
    return downloadUrl.startsWith('http') ? downloadUrl : `${API_ORIGIN}${downloadUrl}`;
  },

  async regenerateChatMessage(messageId: string) {
    const session = await request<BackendSession>(`/chat/messages/${messageId}/regenerate`, { method: 'POST', body: JSON.stringify({}) });
    return mapSession(session);
  },

  async regenerateChatMessageStream(messageId: string, handlers: ChatStreamHandlers) {
    const token = getToken();
    const response = await fetch(`${API_BASE_URL}/chat/messages/${messageId}/regenerate/stream`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      },
      body: JSON.stringify({}),
    });
    if (!response.ok || !response.body) throw new Error(`Backend stream request failed: ${response.status}`);

    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    let buffer = '';
    let finalSession: ChatSession | null = null;

    const handleEvent = (rawEvent: string) => {
      const dataLine = rawEvent
        .split('\n')
        .map((line) => line.trim())
        .find((line) => line.startsWith('data:'));
      if (!dataLine) return;
      const payload = JSON.parse(dataLine.slice(5).trim()) as {
        type: string;
        message?: string;
        reason?: string;
        messageId?: string;
        delta?: string;
        assistantMessage?: BackendMessage;
        session?: BackendSession;
      };
      if (payload.type === 'start' && payload.assistantMessage) handlers.onStart?.(mapMessage(payload.assistantMessage), mapMessage(payload.assistantMessage));
      if (payload.type === 'content' && payload.messageId && payload.delta) handlers.onContent?.(payload.messageId, payload.delta);
      if (payload.type === 'reasoning' && payload.messageId && payload.delta) handlers.onReasoning?.(payload.messageId, payload.delta);
      if (payload.type === 'done' && payload.session) finalSession = mapSession(payload.session);
      if (payload.type === 'error') throw new Error(payload.message ?? payload.reason ?? 'Backend stream failed');
    };

    while (true) {
      const { value, done } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });
      const events = buffer.split('\n\n');
      buffer = events.pop() ?? '';
      events.forEach(handleEvent);
    }
    buffer += decoder.decode();
    if (buffer.trim()) handleEvent(buffer);
    if (!finalSession) throw new Error('Backend stream ended without final session');
    return finalSession;
  },

  async editChatMessage(messageId: string, content: string, imageDataUrls: string[] = []) {
    const session = await request<BackendSession>(`/chat/messages/${messageId}`, {
      method: 'PATCH',
      body: JSON.stringify({ content, imageDataUrls }),
    });
    return mapSession(session);
  },

  async editChatMessageStream(messageId: string, content: string, imageDataUrls: string[] = [], handlers: ChatStreamHandlers) {
    const token = getToken();
    const response = await fetch(`${API_BASE_URL}/chat/messages/${messageId}/edit/stream`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      },
      body: JSON.stringify({ content, imageDataUrls }),
    });
    if (!response.ok || !response.body) throw new Error(`Backend stream request failed: ${response.status}`);

    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    let buffer = '';
    let finalSession: ChatSession | null = null;

    const handleEvent = (rawEvent: string) => {
      const dataLine = rawEvent
        .split('\n')
        .map((line) => line.trim())
        .find((line) => line.startsWith('data:'));
      if (!dataLine) return;
      const payload = JSON.parse(dataLine.slice(5).trim()) as {
        type: string;
        message?: string;
        reason?: string;
        messageId?: string;
        delta?: string;
        userMessage?: BackendMessage;
        assistantMessage?: BackendMessage;
        session?: BackendSession;
      };
      if (payload.type === 'start' && payload.userMessage && payload.assistantMessage) handlers.onStart?.(mapMessage(payload.userMessage), mapMessage(payload.assistantMessage));
      if (payload.type === 'content' && payload.messageId && payload.delta) handlers.onContent?.(payload.messageId, payload.delta);
      if (payload.type === 'reasoning' && payload.messageId && payload.delta) handlers.onReasoning?.(payload.messageId, payload.delta);
      if (payload.type === 'done' && payload.session) finalSession = mapSession(payload.session);
      if (payload.type === 'error') throw new Error(payload.message ?? payload.reason ?? 'Backend stream failed');
    };

    while (true) {
      const { value, done } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });
      const events = buffer.split('\n\n');
      buffer = events.pop() ?? '';
      events.forEach(handleEvent);
    }
    buffer += decoder.decode();
    if (buffer.trim()) handleEvent(buffer);
    if (!finalSession) throw new Error('Backend stream ended without final session');
    return finalSession;
  },

  async feedbackChatMessage(messageId: string, feedback: 'like' | 'dislike' | 'clear', reason?: string) {
    const session = await request<BackendSession>(`/chat/messages/${messageId}/feedback`, {
      method: 'POST',
      body: JSON.stringify({ feedback, reason }),
    });
    return mapSession(session);
  },
};
