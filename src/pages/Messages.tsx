import { useEffect, useState } from 'react';
import { Bell, Key, Lock, User } from 'lucide-react';
import { useAppContext } from '../AppContext';
import { cn } from '../lib/utils';
import { backendApi } from '../services/backendApi';
import type { NotificationMessage } from '../types/domain';

export function Messages() {
  const { user, userRole } = useAppContext();
  const [activeTab, setActiveTab] = useState('notifications');
  const [messages, setMessages] = useState<NotificationMessage[]>([]);

  const reload = async () => {
    setMessages(await backendApi.listMessages(user?.id));
  };

  useEffect(() => {
    void reload();
  }, [user?.id]);

  const markRead = async (id: string) => {
    await backendApi.markMessageRead(id);
    await reload();
  };

  return (
    <div className="p-6 max-w-5xl mx-auto h-full flex flex-col space-y-6">
      <div className="mb-2">
        <h1 className="text-xl font-bold text-slate-700">消息与个人中心</h1>
      </div>

      <div className="flex gap-6 flex-1 min-h-0">
        <div className="w-48 bg-white border border-slate-200/80 rounded-lg p-2 shadow-sm flex flex-col space-y-1 h-fit">
          {[
            ['notifications', Bell, '消息中心'],
            ['profile', User, '账号信息'],
            ['security', Lock, '安全设置'],
            ['keys', Key, 'API 密钥'],
          ].map(([id, Icon, label]) => (
            <button key={id as string} onClick={() => setActiveTab(id as string)} className={cn('w-full text-left px-3 py-2 rounded text-xs font-bold transition-colors flex items-center', activeTab === id ? 'bg-blue-50 text-blue-700' : 'text-slate-600 hover:bg-slate-50')}>
              <Icon className="w-4 h-4 mr-2" /> {label as string}
            </button>
          ))}
        </div>

        <div className="flex-1 bg-white border border-slate-200/80 rounded-lg shadow-sm flex flex-col overflow-hidden">
          {activeTab === 'notifications' && (
            <>
              <div className="p-4 border-b border-slate-100 bg-slate-50/50 flex justify-between items-center">
                <h3 className="font-bold text-slate-700 text-sm">系统通知</h3>
              </div>
              <div className="flex-1 overflow-y-auto custom-scrollbar">
                {messages.map((message) => (
                  <button key={message.id} onClick={() => void markRead(message.id)} className={cn('w-full text-left p-4 border-b border-slate-100 flex gap-3 hover:bg-slate-50', message.readAt && 'opacity-60')}>
                    <div className={cn('w-2 h-2 rounded-full mt-1.5 shrink-0', message.readAt ? 'bg-transparent' : 'bg-blue-500')} />
                    <div>
                      <p className="text-xs text-slate-800 font-bold mb-1">{message.title}</p>
                      <p className="text-[11px] text-slate-500 mb-1">{message.content}</p>
                      <p className="text-[10px] text-slate-400">{message.createdAt}</p>
                    </div>
                  </button>
                ))}
                {messages.length === 0 && <div className="p-8 text-center text-slate-400 text-xs">暂无通知</div>}
              </div>
            </>
          )}

          {activeTab === 'profile' && (
            <div className="p-6">
              <h3 className="font-bold text-slate-700 text-sm mb-6">账号基础信息</h3>
              <div className="space-y-4 max-w-sm">
                <ReadonlyField label="姓名" value={user?.name ?? ''} />
                <ReadonlyField label="用户 ID" value={user?.id ?? ''} />
                <ReadonlyField label="所属组织" value={user?.department ?? ''} />
                <ReadonlyField label="系统角色" value={userRole} />
              </div>
            </div>
          )}

          {(activeTab === 'security' || activeTab === 'keys') && (
            <div className="p-12 text-center text-slate-400">
              <p className="text-sm border p-4 rounded bg-slate-50 inline-block">请在管理中心查看安全配置和开放平台密钥。</p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function ReadonlyField({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <label className="block text-[11px] font-bold text-slate-500 mb-1">{label}</label>
      <input type="text" value={value} readOnly className="w-full text-xs px-3 py-2 bg-slate-50 border border-slate-200 rounded outline-none" />
    </div>
  );
}
