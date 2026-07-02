import type {
  ApiKey,
  Approval,
  AuditLog,
  ChatSession,
  KnowledgeBase,
  KnowledgeDocument,
  ModelConfig,
  User,
} from '../types/domain';

export const defaultUser: User = {
  id: 'u-1001',
  name: '张工',
  department: '水声技术部',
  role: '科研人员',
  ip: '10.12.8.105',
};

export const knowledgeBases: KnowledgeBase[] = [
  {
    id: 'kb-acoustic',
    name: '水声基础理论库',
    department: '水声技术部',
    level: '公开级',
    fileCount: 1250,
    status: '已索引',
    updatedAt: '2026-06-20',
    role: '管理员',
    type: '部门库',
  },
  {
    id: 'kb-project',
    name: '项目报告库',
    department: '项目管理办公室',
    level: '内部级',
    fileCount: 342,
    status: '索引中',
    updatedAt: '2026-06-22',
    role: '查看者',
    type: '授权库',
  },
  {
    id: 'kb-code',
    name: '软件代码规范库',
    department: '软件研发部',
    level: '公开级',
    fileCount: 56,
    status: '已索引',
    updatedAt: '2026-06-15',
    role: '查看者',
    type: '部门库',
  },
  {
    id: 'kb-personal',
    name: '个人文档速查',
    department: '个人',
    level: '私有',
    fileCount: 12,
    status: '已索引',
    updatedAt: '刚才',
    role: '所有者',
    type: '个人库',
  },
];

export const documents: KnowledgeDocument[] = [
  {
    id: 'doc-001',
    knowledgeBaseId: 'kb-acoustic',
    title: '水声学原理第四章：海洋中的声传播',
    fileName: '水声学原理-第四章.pdf',
    status: '已入库',
    securityResult: '通过',
    applicant: '系统初始化',
    submittedAt: '2026-06-20 09:30',
    summary: '解释声速剖面、SOFAR 声道、汇聚区和影区对探测距离的影响。',
  },
  {
    id: 'doc-002',
    knowledgeBaseId: 'kb-project',
    title: '海试项目批次 2025-A 数据总报告',
    fileName: '海试项目批次2025-A数据总报告.pdf',
    status: '已入库',
    securityResult: '通过',
    applicant: '王主任',
    submittedAt: '2026-06-18 15:20',
    summary: '记录复杂海况下声呐平台探测距离变化和跃层影响。',
  },
  {
    id: 'doc-003',
    knowledgeBaseId: 'kb-acoustic',
    title: '声呐阵列信号处理算法预研报告',
    fileName: '声呐阵列信号处理算法预研报告.docx',
    status: '待审核',
    securityResult: '通过',
    applicant: '张工',
    submittedAt: '2026-06-29 14:10',
    summary: '申请入库的算法预研报告，等待知识库管理员复核。',
  },
];

export const approvals: Approval[] = [
  {
    id: 'ap-001',
    type: '文件入库',
    applicant: '张工',
    target: '声呐阵列信号处理算法预研报告.docx',
    status: '待审批',
    risk: '中风险',
    createdAt: '2026-06-29 14:10',
    relatedDocumentId: 'doc-003',
  },
  {
    id: 'ap-002',
    type: '知识库授权',
    applicant: '李研究员',
    target: '申请访问：项目报告库',
    status: '待审批',
    risk: '无风险',
    createdAt: '2026-06-29 09:30',
  },
];

export const chatSessions: ChatSession[] = [
  {
    id: 'chat-001',
    title: '声速剖面对探测距离的影响分析',
    model: 'Qwen3-30B-A3B-w8a8',
    updatedAt: '2026-06-29 14:30',
    messages: [
      {
        id: 'msg-001',
        role: 'user',
        content: '请基于水声知识库说明声速剖面对声呐探测距离的影响。',
        createdAt: '2026-06-29 14:28',
      },
      {
        id: 'msg-002',
        role: 'assistant',
        model: 'Qwen3-30B-A3B-w8a8',
        content:
          '声速剖面对声呐探测距离具有决定性影响。海水温度、盐度和压力会随深度变化，导致声线折射。表面声道会延长近海面传播距离，深海声道可形成远距离低损耗传播，汇聚区会在远距离形成能量增强，而强跃层可能制造影区，使实际探测距离明显低于标称值。',
        createdAt: '2026-06-29 14:29',
        citations: [
          {
            id: 'cite-001',
            documentId: 'doc-001',
            knowledgeBaseId: 'kb-acoustic',
            title: '水声学原理第四章：海洋中的声传播',
            knowledgeBaseName: '水声基础理论库',
            similarity: 98,
            excerpt: '当声源位于声速极小值轴附近时，声能会被捕获在声道内传播，边界散射损耗较小。',
          },
          {
            id: 'cite-002',
            documentId: 'doc-002',
            knowledgeBaseId: 'kb-project',
            title: '海试项目批次 2025-A 数据总报告',
            knowledgeBaseName: '项目报告库',
            similarity: 85,
            excerpt: '夏季强跃层导致影区现象明显，被动平台探测距离较冬季同等海况下降超过 60%。',
          },
        ],
      },
    ],
  },
];

export const auditLogs: AuditLog[] = [
  {
    id: 'aud-001',
    time: '2026-06-29 14:30:12',
    user: '张工',
    role: '科研人员',
    action: '智能问答',
    resource: '水声基础理论库',
    ip: '10.12.8.105',
    risk: 'normal',
    detail: '生成回答并引用 2 条知识库依据。',
  },
  {
    id: 'aud-002',
    time: '2026-06-29 14:10:30',
    user: '张工',
    role: '科研人员',
    action: '文件上传',
    resource: '声呐阵列信号处理算法预研报告.docx',
    ip: '10.12.8.105',
    risk: 'warning',
    detail: '文件通过初筛，已进入入库审批。',
  },
];

export const modelConfigs: ModelConfig[] = [
  { id: 'm-001', name: 'Qwen3-30B-A3B-w8a8', type: '通用大语言模型', status: '正常', isDefault: true, endpoint: '192.168.10.101:8000/v1' },
  { id: 'm-002', name: 'Qwen 3.5', type: '通用大语言模型', status: '正常', isDefault: false, endpoint: '10.12.1.201:8080/v1' },
  { id: 'm-003', name: 'DeepSeek V4', type: '深度推理模型', status: '正常', isDefault: false, endpoint: '10.12.2.100:8000/v1' },
  { id: 'm-004', name: 'DeepSeek R1', type: '备用推理模型', status: '已下线', isDefault: false, endpoint: '-' },
];

export const apiKeys: ApiKey[] = [
  { id: 'key_live_9x8a2b', name: '科研平台后端调用', caller: '平台A-资源服务', expiry: '2026-12-31', limit: '1000/天', status: '正常', createdAt: '2026-01-10' },
  { id: 'key_test_1f3c5d', name: '内部工具测试', caller: '张工（个人分配）', expiry: '2026-06-30', limit: '100/天', status: '正常', createdAt: '2026-06-01' },
];
