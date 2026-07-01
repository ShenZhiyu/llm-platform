import { useEffect, useState } from 'react';
import type React from 'react';
import { useNavigate } from 'react-router-dom';
import { Archive, CheckCircle2, ChevronRight, Database, FileText, MessageSquare, ShieldCheck, UploadCloud } from 'lucide-react';
import { useAppContext } from '../AppContext';
import { backendApi } from '../services/backendApi';
import type { Approval, ChatSession, KnowledgeBase, KnowledgeDocument, NotificationMessage } from '../types/domain';

export function Workspace() {
  const { user, userRole } = useAppContext();
  const navigate = useNavigate();
  const [sessions, setSessions] = useState<ChatSession[]>([]);
  const [knowledgeBases, setKnowledgeBases] = useState<KnowledgeBase[]>([]);
  const [documents, setDocuments] = useState<KnowledgeDocument[]>([]);
  const [approvals, setApprovals] = useState<Approval[]>([]);
  const [messages, setMessages] = useState<NotificationMessage[]>([]);

  useEffect(() => {
    const canReadDocuments = userRole !== '运维账号';
    const approvalScope = userRole === '科研人员' ? 'my' : userRole === '知识库管理员' || userRole === '授权管理员' ? 'todo' : undefined;
    void Promise.all([
      backendApi.listChatSessions(),
      backendApi.listKnowledgeBases(),
      canReadDocuments ? backendApi.listDocuments() : Promise.resolve([]),
      approvalScope ? backendApi.listApprovals(approvalScope) : Promise.resolve([]),
      backendApi.listMessages(user?.id),
    ]).then(([sessionItems, kbItems, documentItems, approvalItems, messageItems]) => {
      setSessions(sessionItems);
      setKnowledgeBases(kbItems.slice(0, 4));
      setDocuments(documentItems);
      setApprovals(approvalItems);
      setMessages(messageItems);
    });
  }, [user?.id, userRole]);

  const pendingApprovalCount = approvals.filter((item) => item.status === '待审批' || item.status.toLowerCase() === 'pending' || item.status.includes('待')).length;
  const approvalCardTitle = userRole === '科研人员' ? '我的申请' : userRole === '运维账号' ? '运维监控' : '待审批';
  const approvalCardValue = userRole === '科研人员' ? approvals.length : userRole === '运维账号' ? 1 : pendingApprovalCount;
  const approvalCardTarget = userRole === '科研人员' ? '/approvals/my' : userRole === '运维账号' ? '/ops' : '/approvals/todo';
  const sessionCardTitle = userRole === '运维账号' ? '模型管理' : '最近会话';
  const sessionCardValue = userRole === '运维账号' ? 1 : sessions.length;
  const sessionCardTarget = userRole === '运维账号' ? '/admin/models' : '/chat';
  const documentCardTitle = userRole === '运维账号' ? '系统报表' : '知识库文档';
  const documentCardValue = userRole === '运维账号' ? 1 : documents.length;
  const documentCardTarget = userRole === '运维账号' ? '/reports' : '/kb';
  const unreadMessages = messages.filter((item) => !item.readAt);

  return (
    <div className="p-6 max-w-7xl mx-auto space-y-6">
      <div className="flex items-end justify-between">
        <div>
          <h1 className="text-xl font-bold text-slate-800">个人工作台</h1>
          <p className="text-xs font-semibold text-slate-500 mt-1">{user?.name ?? '用户'}，欢迎回来。这里展示后端真实会话、审批、知识库和通知。</p>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard title={approvalCardTitle} value={approvalCardValue} icon={CheckCircle2} color="text-blue-600" bg="bg-blue-50" onClick={() => navigate(approvalCardTarget)} />
        <StatCard title={sessionCardTitle} value={sessionCardValue} icon={MessageSquare} color="text-orange-500" bg="bg-orange-50" onClick={() => navigate(sessionCardTarget)} />
        <StatCard title={documentCardTitle} value={documentCardValue} icon={FileText} color="text-indigo-600" bg="bg-indigo-50" onClick={() => navigate(documentCardTarget)} />
        <StatCard title="未读通知" value={unreadMessages.length} icon={Database} color="text-emerald-600" bg="bg-emerald-50" onClick={() => navigate('/messages')} />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="lg:col-span-2 space-y-6">
          <Panel title="最近会话" action={<button onClick={() => navigate('/chat/archived')} className="text-sm text-slate-500 hover:text-blue-600 flex items-center"><Archive className="w-4 h-4 mr-1" />归档会话</button>}>
            {sessions.length === 0 ? (
              <div className="px-6 py-10 text-center text-sm text-slate-500">暂无最近会话</div>
            ) : (
              sessions.slice(0, 5).map((session) => (
                <button key={session.id} onClick={() => navigate(`/chat?sessionId=${session.id}`)} className="w-full px-6 py-4 hover:bg-slate-50 cursor-pointer flex items-center justify-between group text-left border-t border-slate-50">
                  <div className="flex items-center min-w-0">
                    <MessageSquare className="w-5 h-5 text-slate-400 mr-3 group-hover:text-blue-500 shrink-0" />
                    <div className="min-w-0">
                      <p className="text-slate-800 font-medium text-sm group-hover:text-blue-600 transition-colors truncate">{session.title}</p>
                      <p className="text-slate-400 text-xs mt-1">智能问答 / {session.model} / {session.messages.length} 条消息</p>
                    </div>
                  </div>
                  <span className="text-xs text-slate-400 shrink-0 ml-4">{session.updatedAt}</span>
                </button>
              ))
            )}
          </Panel>

          <Panel title="待处理文件">
            <div className="flex flex-col items-center justify-center py-8 text-slate-500">
              <UploadCloud className="w-12 h-12 text-slate-200 mb-3" />
              <p className="text-sm">上传文档后可进入真实审核和索引流程。</p>
              <button onClick={() => navigate('/kb/upload')} className="mt-4 px-4 py-2 bg-blue-50 text-blue-600 rounded text-sm font-medium hover:bg-blue-100 transition-colors">上传文件</button>
            </div>
          </Panel>
        </div>

        <div className="space-y-6">
          <Panel
            title="常用知识库"
            action={(
              <div className="flex items-center gap-3">
                {userRole === '授权管理员' && (
                  <button onClick={() => navigate('/kb/auth')} className="text-xs text-slate-500 hover:text-blue-600 flex items-center">
                    <ShieldCheck className="w-3 h-3 mr-1" />授权
                  </button>
                )}
                <button onClick={() => navigate('/kb')} className="text-xs text-blue-600 flex items-center">全部 <ChevronRight className="w-3 h-3" /></button>
              </div>
            )}
          >
            <div className="p-4 space-y-2">
              {knowledgeBases.map((kb) => (
                <button key={kb.id} onClick={() => navigate(`/kb/${kb.id}`)} className="w-full flex items-center justify-between p-3 rounded bg-blue-50/40 border border-blue-50 hover:bg-white hover:border-blue-100 transition-colors text-left">
                  <div className="flex items-center min-w-0">
                    <Database className="w-4 h-4 text-blue-400 mr-2 shrink-0" />
                    <span className="text-xs text-blue-900 font-medium truncate">{kb.name}</span>
                  </div>
                  <span className="text-[10px] text-slate-500">{kb.fileCount} 文档</span>
                </button>
              ))}
            </div>
          </Panel>

          <Panel title="未读通知">
            <div className="p-4 space-y-2">
              {unreadMessages.slice(0, 5).map((message) => <div key={message.id} className="text-xs text-slate-600 border-b border-slate-100 pb-2"><div className="font-bold text-slate-700">{message.title}</div><div>{message.content}</div></div>)}
              {unreadMessages.length === 0 && <div className="text-xs text-slate-400 text-center py-6">暂无未读通知</div>}
            </div>
          </Panel>
        </div>
      </div>
    </div>
  );
}

function Panel({ title, action, children }: { title: string; action?: React.ReactNode; children: React.ReactNode }) {
  return (
    <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
      <div className="px-6 py-4 border-b border-slate-100 flex justify-between items-center">
        <h3 className="font-semibold text-slate-800">{title}</h3>
        {action}
      </div>
      {children}
    </div>
  );
}

function StatCard({ title, value, icon: Icon, color, bg, onClick }: { title: string; value: number; icon: any; color: string; bg: string; onClick?: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="w-full bg-white p-5 rounded-lg border border-slate-200 shadow-sm flex items-center justify-between hover:border-slate-300 hover:bg-slate-50 transition-colors text-left"
    >
      <div>
        <p className="text-[11px] font-bold text-slate-500 mb-1">{title}</p>
        <p className="text-2xl font-bold text-slate-800">{value}</p>
      </div>
      <div className={`w-10 h-10 rounded ${bg} flex items-center justify-center`}>
        <Icon className={`w-5 h-5 ${color}`} />
      </div>
    </button>
  );
}
