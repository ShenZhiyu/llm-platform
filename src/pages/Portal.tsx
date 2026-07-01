import { useNavigate } from 'react-router-dom';
import { Building2, Code, Database, LayoutDashboard, Library, MessageSquareText, MonitorCheck, Network, PenTool, Settings, ShieldCheck } from 'lucide-react';
import { useAppContext } from '../AppContext';
import { getAllowedPaths } from '../components/MainLayout';
import { cn } from '../lib/utils';

const apps = [
  { id: 'workspace', name: '个人工作台', icon: LayoutDashboard, desc: '个人日常办公与待办处理中心', path: '/workspace' },
  { id: 'chat', name: '智能问答', icon: MessageSquareText, desc: '基于大模型与知识库的自由对话', path: '/chat' },
  { id: 'kb', name: '知识库中心', icon: Library, desc: '公共知识库、个人文档和真实检索索引管理', path: '/kb' },
  { id: 'akb', name: '领域知识库', icon: Database, desc: '按领域查看后端真实知识库目录', path: '/akb' },
  { id: 'writing', name: 'AI 写作', icon: PenTool, desc: '公文、报告和总结生成任务', path: '/writing' },
  { id: 'office', name: 'AI 办公', icon: MonitorCheck, desc: '办公任务和会议纪要模型调用', path: '/ai-office' },
  { id: 'code', name: '代码助手', icon: Code, desc: '代码分析、生成和排错任务', path: '/code' },
  { id: 'auth', name: '权限审批', icon: ShieldCheck, desc: '知识库授权与审批处理', path: '/kb/auth' },
  { id: 'audit', name: '安全审计', icon: ShieldCheck, desc: '系统操作日志和合规追踪', path: '/audit' },
  { id: 'ops', name: '运维监控', icon: Network, desc: '基础设施、模型和索引状态', path: '/ops' },
  { id: 'admin', name: '管理后台', icon: Settings, desc: '用户、角色、模型和开放平台配置', path: '/admin' },
];

export function Portal() {
  const navigate = useNavigate();
  const { userRole, user } = useAppContext();
  const allowed = getAllowedPaths(userRole);

  return (
    <div className="p-6 max-w-7xl mx-auto">
      <div className="mb-6 flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold text-slate-800">应用入口</h1>
          <p className="text-xs text-slate-500 mt-1">当前用户：{user?.name} / {userRole}。不可访问模块会置灰，路由层也会拦截。</p>
        </div>
        <div className="flex items-center gap-2 text-xs text-slate-500 bg-white border border-slate-200 rounded px-3 py-2">
          <Building2 className="w-4 h-4 text-blue-500" />
          后端真实 API
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
        {apps.map((app) => {
          const hasAccess = allowed.some((path) => app.path === path || app.path.startsWith(`${path}/`));
          return (
            <button key={app.id} onClick={() => hasAccess && navigate(app.path)} className={cn('bg-white border rounded-lg p-5 text-left shadow-sm transition-all min-h-32', hasAccess ? 'border-slate-200 hover:border-blue-300 hover:shadow-md' : 'border-slate-100 opacity-50 cursor-not-allowed')}>
              <div className="flex items-start justify-between">
                <div className="w-10 h-10 rounded bg-blue-50 text-blue-600 flex items-center justify-center">
                  <app.icon className="w-5 h-5" />
                </div>
                {!hasAccess && <span className="text-[10px] px-2 py-0.5 rounded bg-slate-100 text-slate-500">无权限</span>}
              </div>
              <h3 className="mt-4 text-sm font-bold text-slate-800">{app.name}</h3>
              <p className="mt-1 text-xs leading-5 text-slate-500">{app.desc}</p>
            </button>
          );
        })}
      </div>
    </div>
  );
}
