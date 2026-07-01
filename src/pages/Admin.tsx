import { useEffect, useState } from 'react';
import { ShieldCheck, User, Users } from 'lucide-react';
import { roles } from '../AppContext';
import { roleAccess } from '../components/MainLayout';
import { backendApi } from '../services/backendApi';
import type { User as DomainUser } from '../types/domain';

export function Admin() {
  const [activeTab, setActiveTab] = useState<'users' | 'roles'>('users');
  const [users, setUsers] = useState<DomainUser[]>([]);

  const reload = async () => {
    setUsers(await backendApi.listUsers());
  };

  useEffect(() => {
    void reload();
  }, []);

  const toggleUser = async (target: DomainUser) => {
    await backendApi.updateUser(target.id, { isActive: !(target.isActive ?? true) });
    await reload();
  };

  return (
    <div className="p-6 max-w-7xl mx-auto h-full flex flex-col">
      <div className="mb-6">
        <h1 className="text-xl font-bold text-slate-700 flex items-center gap-2">
          <Users className="w-6 h-6 text-blue-500" />
          用户与权限
        </h1>
        <p className="text-xs text-slate-500 mt-1">用户列表来自后端数据库，启停操作会写入审计日志。</p>
      </div>

      <div className="bg-white border border-slate-200 rounded-lg shadow-sm overflow-hidden flex-1">
        <div className="p-3 border-b bg-slate-50 flex gap-2">
          <button onClick={() => setActiveTab('users')} className={`px-3 py-1.5 rounded text-xs font-bold ${activeTab === 'users' ? 'bg-white text-blue-700 border border-blue-100' : 'text-slate-500'}`}>用户列表</button>
          <button onClick={() => setActiveTab('roles')} className={`px-3 py-1.5 rounded text-xs font-bold ${activeTab === 'roles' ? 'bg-white text-blue-700 border border-blue-100' : 'text-slate-500'}`}>角色权限</button>
        </div>

        {activeTab === 'users' ? (
          <table className="w-full text-sm">
            <thead className="bg-slate-50 text-left">
              <tr>
                <th className="p-4 text-xs text-slate-500">用户</th>
                <th className="p-4 text-xs text-slate-500">部门</th>
                <th className="p-4 text-xs text-slate-500">角色</th>
                <th className="p-4 text-xs text-slate-500">IP</th>
                <th className="p-4 text-xs text-slate-500">状态</th>
                <th className="p-4 text-xs text-slate-500">操作</th>
              </tr>
            </thead>
            <tbody>
              {users.map((item) => (
                <tr key={item.id} className="border-t border-slate-100">
                  <td className="p-4 font-bold text-slate-700 flex items-center gap-2"><User className="w-4 h-4 text-slate-400" />{item.name}<span className="text-xs text-slate-400 font-normal">{item.id}</span></td>
                  <td className="p-4 text-slate-600">{item.department}</td>
                  <td className="p-4"><span className="px-2 py-0.5 rounded bg-blue-50 text-blue-700 text-xs font-bold">{item.role}</span></td>
                  <td className="p-4 text-slate-500 font-mono text-xs">{item.ip}</td>
                  <td className="p-4"><span className={`px-2 py-0.5 rounded text-xs ${(item.isActive ?? true) ? 'bg-green-50 text-green-700' : 'bg-slate-100 text-slate-500'}`}>{(item.isActive ?? true) ? '正常' : '停用'}</span></td>
                  <td className="p-4"><button onClick={() => void toggleUser(item)} className="text-xs text-blue-600 font-bold">{(item.isActive ?? true) ? '停用' : '启用'}</button></td>
                </tr>
              ))}
            </tbody>
          </table>
        ) : (
          <div className="p-4 grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
            {roles.map((role) => (
              <div key={role} className="border border-slate-200 rounded-lg p-4">
                <h3 className="font-bold text-slate-800 flex items-center gap-2">
                  <ShieldCheck className="w-4 h-4 text-blue-500" />
                  {role}
                </h3>
                <div className="mt-3 flex flex-wrap gap-1">
                  {(roleAccess[role] ?? []).map((path) => (
                    <span key={path} className="px-2 py-0.5 rounded bg-slate-100 text-slate-500 text-[10px] font-mono">{path}</span>
                  ))}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
