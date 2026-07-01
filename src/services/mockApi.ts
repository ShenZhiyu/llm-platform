import {
  apiKeys,
  approvals,
  auditLogs,
  chatSessions,
  defaultUser,
  documents,
  knowledgeBases,
  modelConfigs,
} from '../mocks/seed';
import { readStore, writeStore } from '../stores/localStore';
import type {
  ApiKey,
  Approval,
  AuditLog,
  ChatMessage,
  ChatSession,
  KnowledgeBase,
  KnowledgeDocument,
  Model,
  Role,
  User,
} from '../types/domain';

const STORE = {
  sessions: 'llm-platform:sessions',
  knowledgeBases: 'llm-platform:knowledge-bases',
  documents: 'llm-platform:documents',
  approvals: 'llm-platform:approvals',
  audits: 'llm-platform:audits',
};

const delay = <T,>(value: T, ms = 180) =>
  new Promise<T>((resolve) => window.setTimeout(() => resolve(value), ms));

const now = () =>
  new Intl.DateTimeFormat('zh-CN', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false,
  })
    .format(new Date())
    .replace(/\//g, '-');

const id = (prefix: string) => `${prefix}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`;

function getSessions() {
  return readStore<ChatSession[]>(STORE.sessions, chatSessions);
}

function setSessions(value: ChatSession[]) {
  writeStore(STORE.sessions, value);
}

function getDocuments() {
  return readStore<KnowledgeDocument[]>(STORE.documents, documents);
}

function setDocuments(value: KnowledgeDocument[]) {
  writeStore(STORE.documents, value);
}

function getApprovals() {
  return readStore<Approval[]>(STORE.approvals, approvals);
}

function setApprovals(value: Approval[]) {
  writeStore(STORE.approvals, value);
}

function getAudits() {
  return readStore<AuditLog[]>(STORE.audits, auditLogs);
}

function setAudits(value: AuditLog[]) {
  writeStore(STORE.audits, value);
}

export const api = {
  async login(role: Role = defaultUser.role) {
    const user: User = { ...defaultUser, role };
    await api.addAudit(user, '登录系统', '统一身份认证', 'normal', '通过 USBKey/PIN 模拟认证进入平台。');
    return delay(user);
  },

  async listKnowledgeBases() {
    return delay(readStore<KnowledgeBase[]>(STORE.knowledgeBases, knowledgeBases));
  },

  async listDocuments() {
    return delay(getDocuments());
  },

  async listApprovals() {
    return delay(getApprovals());
  },

  async listAuditLogs() {
    return delay(getAudits());
  },

  async listModels() {
    return delay(modelConfigs);
  },

  async listApiKeys(): Promise<ApiKey[]> {
    return delay(apiKeys);
  },

  async listChatSessions() {
    return delay(getSessions());
  },

  async createChatSession(model: Model) {
    const session: ChatSession = {
      id: id('chat'),
      title: '新的对话',
      model,
      updatedAt: now(),
      messages: [],
    };
    const sessions = [session, ...getSessions()];
    setSessions(sessions);
    return delay(session);
  },

  async sendMessage(sessionId: string, content: string, model: Model, user: User) {
    const sessions = getSessions();
    const session = sessions.find((item) => item.id === sessionId) ?? sessions[0];
    const userMessage: ChatMessage = {
      id: id('msg'),
      role: 'user',
      content,
      createdAt: now(),
    };
    const assistantMessage: ChatMessage = {
      id: id('msg'),
      role: 'assistant',
      model,
      createdAt: now(),
      content:
        '已基于知识库完成检索。综合水声基础理论库与项目报告库，声速剖面会通过折射改变声线传播路径；当存在表面声道或深海声道时，传播损耗降低，探测距离增加；当强跃层形成影区时，目标回波可能被遮蔽，实际探测距离会显著下降。建议在任务规划中同步使用 XBT/CTD 实测剖面更新声场模型。',
      citations: [
        {
          id: id('cite'),
          documentId: 'doc-001',
          knowledgeBaseId: 'kb-acoustic',
          title: '水声学原理第四章：海洋中的声传播',
          knowledgeBaseName: '水声基础理论库',
          similarity: 98,
          excerpt: '声速梯度会导致声线向声速较低区域弯曲，改变有效覆盖范围。',
        },
        {
          id: id('cite'),
          documentId: 'doc-002',
          knowledgeBaseId: 'kb-project',
          title: '海试项目批次 2025-A 数据总报告',
          knowledgeBaseName: '项目报告库',
          similarity: 85,
          excerpt: '强跃层条件下被动平台探测距离较冬季同等海况下降超过 60%。',
        },
      ],
    };

    const nextSession: ChatSession = {
      ...session,
      title: session.messages.length === 0 ? content.slice(0, 24) : session.title,
      model,
      updatedAt: now(),
      messages: [...session.messages, userMessage, assistantMessage],
    };
    setSessions(sessions.map((item) => (item.id === nextSession.id ? nextSession : item)));
    await api.addAudit(user, '智能问答', `会话 ${nextSession.title}`, 'normal', `使用 ${model} 生成回答并引用 ${assistantMessage.citations?.length ?? 0} 条知识库依据。`);
    return delay(nextSession, 500);
  },

  async uploadDocument(fileName: string, user: User, blocked = false) {
    const document: KnowledgeDocument = {
      id: id('doc'),
      knowledgeBaseId: 'kb-acoustic',
      title: fileName.replace(/\.[^.]+$/, ''),
      fileName,
      status: blocked ? '已拦截' : '待审核',
      securityResult: blocked ? '疑似涉密' : '通过',
      applicant: user.name,
      submittedAt: now(),
      summary: blocked ? '命中疑似涉密版头或高敏词组合，已阻断。' : '文档已通过基础安全检测，等待知识库管理员复核。',
    };
    setDocuments([document, ...getDocuments()]);

    if (!blocked) {
      const approval: Approval = {
        id: id('ap'),
        type: '文件入库',
        applicant: user.name,
        target: fileName,
        status: '待审批',
        risk: '中风险',
        createdAt: now(),
        relatedDocumentId: document.id,
      };
      setApprovals([approval, ...getApprovals()]);
    }

    await api.addAudit(
      user,
      blocked ? '安全拦截' : '文件上传',
      fileName,
      blocked ? 'danger' : 'warning',
      blocked ? '检测到疑似涉密内容，上传已阻断。' : '文件通过初筛，已进入入库审批。',
    );
    return delay(document, 500);
  },

  async decideApproval(approvalId: string, approved: boolean, user: User) {
    const nextApprovals = getApprovals().map((approval) =>
      approval.id === approvalId ? { ...approval, status: approved ? '已通过' : '已驳回' } satisfies Approval : approval,
    );
    setApprovals(nextApprovals);

    const approval = nextApprovals.find((item) => item.id === approvalId);
    if (approval?.relatedDocumentId) {
      const nextDocuments = getDocuments().map((document) =>
        document.id === approval.relatedDocumentId ? { ...document, status: approved ? '已入库' : '已驳回' } satisfies KnowledgeDocument : document,
      );
      setDocuments(nextDocuments);
    }

    await api.addAudit(user, approved ? '审批通过' : '审批驳回', approval?.target ?? approvalId, approved ? 'normal' : 'warning', `${user.name}处理了${approval?.type ?? '审批'}申请。`);
    return delay(nextApprovals);
  },

  async addAudit(user: User, action: string, resource: string, risk: AuditLog['risk'], detail: string) {
    const log: AuditLog = {
      id: id('aud'),
      time: now(),
      user: user.name,
      role: user.role,
      action,
      resource,
      ip: user.ip,
      risk,
      detail,
    };
    setAudits([log, ...getAudits()]);
    return delay(log, 80);
  },
};
