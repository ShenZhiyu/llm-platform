import { useEffect, useState } from 'react';
import { Archive, ArrowLeft, RotateCcw, Trash2 } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { backendApi } from '../services/backendApi';
import type { ChatSession } from '../types/domain';

export function ArchivedChats() {
  const navigate = useNavigate();
  const [sessions, setSessions] = useState<ChatSession[]>([]);
  const [loading, setLoading] = useState(true);

  const load = async () => {
    setLoading(true);
    const items = await backendApi.listArchivedChatSessions();
    setSessions(items);
    setLoading(false);
  };

  useEffect(() => {
    void load();
  }, []);

  const restore = async (sessionId: string) => {
    const session = await backendApi.restoreChatSession(sessionId);
    setSessions((items) => items.filter((item) => item.id !== session.id));
    navigate(`/chat?sessionId=${session.id}`);
  };

  const hardDelete = async (session: ChatSession) => {
    if (!window.confirm(`确定永久删除会话“${session.title}”吗？此操作不可恢复。`)) return;
    await backendApi.hardDeleteChatSession(session.id);
    setSessions((items) => items.filter((item) => item.id !== session.id));
  };

  const hardDeleteAll = async () => {
    if (sessions.length === 0) return;
    if (!window.confirm(`确定永久删除全部 ${sessions.length} 个归档会话吗？此操作不可恢复。`)) return;
    await backendApi.hardDeleteAllArchivedChatSessions();
    setSessions([]);
  };

  return (
    <div className="p-6 max-w-5xl mx-auto space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold text-slate-800">归档会话</h1>
          <p className="text-xs text-slate-500 mt-1">归档会话不会出现在普通最近会话中，可在这里恢复或永久删除。</p>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={() => void hardDeleteAll()}
            disabled={sessions.length === 0}
            className="px-3 py-1.5 text-xs rounded border border-red-200 text-red-600 hover:bg-red-50 disabled:opacity-50 inline-flex items-center gap-1"
          >
            <Trash2 className="w-3.5 h-3.5" />
            一键删除全部归档
          </button>
          <button onClick={() => navigate('/chat')} className="px-3 py-1.5 text-xs rounded border border-slate-200 text-slate-600 hover:bg-slate-50 inline-flex items-center gap-1">
            <ArrowLeft className="w-3.5 h-3.5" />
            返回智能问答
          </button>
        </div>
      </div>

      <div className="bg-white border border-slate-200 rounded-lg shadow-sm overflow-hidden">
        {loading ? (
          <div className="p-8 text-sm text-slate-500">正在加载归档会话...</div>
        ) : sessions.length === 0 ? (
          <div className="p-10 flex flex-col items-center text-slate-500">
            <Archive className="w-10 h-10 text-slate-300 mb-3" />
            <p className="text-sm">暂无归档会话</p>
          </div>
        ) : (
          <div className="divide-y divide-slate-100">
            {sessions.map((session) => (
              <div key={session.id} className="p-4 flex items-center justify-between gap-4 hover:bg-slate-50">
                <div className="min-w-0">
                  <div className="font-medium text-sm text-slate-800 truncate">{session.title}</div>
                  <div className="text-xs text-slate-400 mt-1">
                    归档时间：{session.archivedAt ?? '-'} / 消息数：{session.messages.length} / 模型：{session.model}
                  </div>
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  <button
                    onClick={() => void restore(session.id)}
                    className="px-3 py-1.5 text-xs rounded border border-blue-200 text-blue-600 hover:bg-blue-50 inline-flex items-center gap-1"
                  >
                    <RotateCcw className="w-3.5 h-3.5" />
                    恢复
                  </button>
                  <button
                    onClick={() => void hardDelete(session)}
                    className="px-3 py-1.5 text-xs rounded border border-red-200 text-red-600 hover:bg-red-50 inline-flex items-center gap-1"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                    永久删除
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
