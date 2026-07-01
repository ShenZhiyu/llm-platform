import { useEffect, useMemo, useState } from 'react';
import { NavLink, Navigate, Outlet, useLocation } from 'react-router-dom';
import {
  Bell,
  Bot,
  Building2,
  CheckCircle2,
  Code,
  Cpu,
  Database,
  FileText,
  Key,
  LayoutDashboard,
  Library,
  LogOut,
  MessageSquareText,
  MonitorCheck,
  Network,
  PenTool,
  PieChart,
  Search,
  ShieldCheck,
  User,
} from 'lucide-react';
import { useAppContext } from '../AppContext';
import { cn } from '../lib/utils';
import { backendApi } from '../services/backendApi';
import type { ModelConfig, Role } from '../types/domain';

const BASIC_PATHS = ['/portal', '/workspace', '/messages'];

export const roleAccess: Record<Role, string[]> = {
  科研人员: ['/portal', '/workspace', '/messages', '/chat', '/chat/archived', '/writing', '/ai-office', '/meeting', '/kb', '/kb/upload', '/akb', '/code', '/approvals/my'],
  知识库管理员: ['/portal', '/workspace', '/messages', '/chat', '/chat/archived', '/writing', '/ai-office', '/meeting', '/kb', '/kb/upload', '/kb/review', '/akb', '/approvals/my', '/approvals/todo', '/audit', '/reports'],
  授权管理员: ['/portal', '/workspace', '/messages', '/chat', '/chat/archived', '/writing', '/ai-office', '/meeting', '/kb', '/kb/auth', '/akb', '/admin', '/approvals/my', '/approvals/todo'],
  运维账号: ['/portal', '/workspace', '/messages', '/admin', '/admin/models', '/admin/openapi', '/ops', '/reports'],
};

const navGroups = [
  {
    groupLabel: '首页',
    items: [
      { path: '/workspace', label: '工作台', icon: LayoutDashboard },
      { path: '/portal', label: '应用入口', icon: Building2 },
      { path: '/messages', label: '消息通知', icon: Bell },
    ],
  },
  {
    groupLabel: 'AI 应用',
    items: [
      { path: '/chat', label: '智能问答', icon: MessageSquareText },
      { path: '/writing', label: '智能写作', icon: PenTool },
      { path: '/ai-office', label: '智能办公', icon: MonitorCheck },
      { path: '/meeting', label: '会议纪要', icon: FileText },
      { path: '/code', label: '代码助手', icon: Code },
    ],
  },
  {
    groupLabel: '知识库',
    items: [
      { path: '/kb', label: '知识库中心', icon: Library },
      { path: '/akb', label: '领域知识库', icon: Database },
    ],
  },
  {
    groupLabel: '审批',
    items: [
      { path: '/approvals/my', label: '我的申请', icon: FileText },
      { path: '/approvals/todo', label: '待我审批', icon: CheckCircle2 },
      { path: '/kb/review', label: '入库审核', icon: Search },
      { path: '/kb/auth', label: '知识库授权', icon: ShieldCheck },
    ],
  },
  {
    groupLabel: '管理',
    items: [
      { path: '/admin', label: '用户与权限', icon: User },
      { path: '/admin/models', label: '模型管理', icon: Cpu },
      { path: '/admin/openapi', label: '开放平台', icon: Key },
      { path: '/audit', label: '安全审计', icon: ShieldCheck },
      { path: '/ops', label: '运维监控', icon: Network },
      { path: '/reports', label: '系统报表', icon: PieChart },
    ],
  },
];

export function getAllowedPaths(role: Role) {
  return roleAccess[role] ?? BASIC_PATHS;
}

function isKnowledgeBaseDetailPath(pathname: string) {
  return /^\/kb\/[^/]+$/.test(pathname) && !['/kb/auth', '/kb/review', '/kb/upload'].includes(pathname);
}

function isNavItemActive(pathname: string, itemPath: string) {
  if (pathname === itemPath) return true;
  if (itemPath === '/kb') return isKnowledgeBaseDetailPath(pathname);
  if (itemPath === '/chat') return pathname.startsWith('/chat/') && pathname !== '/chat/archived';
  return false;
}

export function MainLayout() {
  const { isAuthenticated, authLoading, user, userRole, currentModel, setCurrentModel, logout } = useAppContext();
  const location = useLocation();
  const [modelOptions, setModelOptions] = useState<ModelConfig[]>([]);


  const allowedPaths = getAllowedPaths(userRole);
  const allItems = navGroups.flatMap((group) => group.items.map((item) => ({ ...item, group: group.groupLabel })));
  const current = allItems.find((item) => isNavItemActive(location.pathname, item.path));
  const availableModels = useMemo(
    () => modelOptions.filter((model) => model.status === '正常' || model.status.toLowerCase() === 'normal'),
    [modelOptions],
  );

  useEffect(() => {
    if (!isAuthenticated) return;
    let active = true;
    void backendApi
      .listModels()
      .then((items) => {
        if (!active) return;
        setModelOptions(items);
        const normalModels = items.filter((model) => model.status === '正常' || model.status.toLowerCase() === 'normal');
        const defaultModel = normalModels.find((model) => model.isDefault) ?? normalModels[0];
        if (defaultModel && !normalModels.some((model) => model.name === currentModel)) {
          setCurrentModel(defaultModel.name);
        }
      })
      .catch(() => {
        if (active) setModelOptions([]);
      });
    return () => {
      active = false;
    };
  }, [currentModel, isAuthenticated, setCurrentModel]);

  if (authLoading) return <div className="h-screen grid place-items-center text-sm text-slate-500">正在恢复登录状态...</div>;
  if (!isAuthenticated) return <Navigate to="/login" replace />;

  return (
    <div className="flex h-screen w-full bg-slate-50 overflow-hidden text-slate-800 font-sans">
      <aside className="w-48 shrink-0 bg-white text-slate-600 flex flex-col border-r border-slate-200 text-[13px] z-20">
        <div className="h-12 px-3 border-b border-slate-200 flex items-center gap-2">
          <div className="w-8 h-8 bg-blue-100 rounded flex items-center justify-center font-bold text-blue-600 text-xs">AI</div>
          <span className="font-bold text-slate-700 text-sm">智能大模型系统</span>
        </div>

        <div className="flex-1 overflow-y-auto py-4 custom-scrollbar space-y-5">
          {navGroups.map((navGroup) => {
            const visibleItems = navGroup.items.filter((item) => allowedPaths.includes(item.path));
            if (visibleItems.length === 0) return null;
            return (
              <div key={navGroup.groupLabel} className="px-2">
                <div className="mb-2 px-2 text-[11px] font-bold text-slate-400 tracking-wider">{navGroup.groupLabel}</div>
                <nav className="space-y-0.5">
                  {visibleItems.map((item) => (
                    <NavLink
                      key={item.path}
                      to={item.path}
                      className={() =>
                        cn(
                          'flex items-center px-2 py-2 gap-2.5 text-slate-500 rounded transition-colors hover:bg-slate-100 hover:text-slate-700',
                          isNavItemActive(location.pathname, item.path) && 'bg-blue-50 text-blue-700 font-bold',
                        )
                      }
                    >
                      <item.icon className="w-4 h-4 shrink-0" />
                      {item.label}
                    </NavLink>
                  ))}
                </nav>
              </div>
            );
          })}
        </div>
      </aside>

      <div className="flex-1 flex flex-col min-w-0">
        <header className="h-12 bg-white border-b border-slate-200 px-4 flex items-center justify-between shadow-sm z-10 shrink-0">
          <div className="flex items-center gap-5 min-w-0">
            <div className="text-[12px] text-slate-500 min-w-0">
              <span className="font-bold text-slate-500">{current?.group ?? '平台'}</span>
              <span className="mx-2 text-slate-300">/</span>
              <span className="font-bold text-slate-800 truncate">{current?.label ?? '工作台'}</span>
            </div>
            <div className="h-6 w-px bg-slate-200" />
            <div className="flex items-center gap-2">
              <Bot className="w-4 h-4 text-blue-500" />
              <span className="text-[12px] text-slate-500 font-medium">当前模型</span>
              <select value={currentModel} onChange={(event) => setCurrentModel(event.target.value as never)} className="bg-slate-100 rounded px-2 py-0.5 text-[12px] font-medium outline-none">
                {(availableModels.length > 0 ? availableModels : [{ id: currentModel, name: currentModel }]).map((model) => (
                  <option key={model.id} value={model.name}>{model.name}</option>
                ))}
              </select>
            </div>
          </div>

          <div className="flex items-center gap-4">
            <div className="text-[11px] font-bold text-blue-700 bg-blue-50 border border-blue-100 rounded px-2 py-1">{userRole}</div>
            <NavLink to="/messages" className="text-slate-400 hover:text-blue-600 transition-colors relative" title="消息通知">
              <Bell className="w-4 h-4" />
            </NavLink>
            <div className="w-8 h-8 rounded-full bg-slate-200 border border-slate-300 flex items-center justify-center text-xs font-bold text-slate-600">
              {user?.name.slice(0, 1) ?? '用'}
            </div>
            <button onClick={() => void logout()} className="text-slate-400 hover:text-red-600" title="退出系统">
              <LogOut className="w-4 h-4" />
            </button>
          </div>
        </header>

        <main className="flex-1 overflow-auto bg-slate-100 relative">
          <Outlet />
        </main>

        <footer className="h-6 bg-slate-200 border-t border-slate-300 px-4 flex items-center justify-between text-[10px] text-slate-500 font-mono shrink-0">
          <div className="flex items-center gap-4">
            <span>Backend API: active</span>
            <span>Auth: token</span>
            <span>Port: 3001</span>
          </div>
          <span>{user?.department} / {user?.name}</span>
        </footer>
      </div>
    </div>
  );
}
