import { useEffect, useState } from 'react';
import { Archive, Key, Plus } from 'lucide-react';
import { backendApi } from '../services/backendApi';
import type { ApiKey } from '../types/domain';

export function AdminOpenApi() {
  const [keys, setKeys] = useState<ApiKey[]>([]);

  useEffect(() => {
    void backendApi.listApiKeys().then(setKeys);
  }, []);

  const createKey = async () => {
    const key = await backendApi.createApiKey({ name: '新建接入密钥', caller: '内部系统', expiry: '长期有效', limit: '1000/day' });
    setKeys((items) => [key, ...items]);
    window.alert(`密钥只显示一次：${key.secret ?? key.id}`);
  };

  const revoke = async (id: string) => {
    const key = await backendApi.revokeApiKey(id);
    setKeys((items) => items.map((item) => (item.id === id ? key : item)));
  };

  return (
    <div className="p-6 max-w-7xl mx-auto h-full flex flex-col">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-xl font-bold text-slate-700 flex items-center">
            <Key className="w-6 h-6 mr-2 text-violet-500" />
            开放平台
          </h1>
          <p className="text-xs text-slate-500 mt-1">API Key 已接入后端，密钥明文只在创建时返回一次。</p>
        </div>
        <button onClick={() => void createKey()} className="px-3 py-1.5 text-xs rounded bg-violet-600 text-white flex items-center">
          <Plus className="w-3.5 h-3.5 mr-1" />
          新增密钥
        </button>
      </div>
      <div className="bg-white border border-slate-200 rounded-lg shadow-sm overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-slate-50 text-left">
            <tr>
              <th className="p-4 text-xs text-slate-500">密钥 ID</th>
              <th className="p-4 text-xs text-slate-500">用途</th>
              <th className="p-4 text-xs text-slate-500">调用方</th>
              <th className="p-4 text-xs text-slate-500">Scope</th>
              <th className="p-4 text-xs text-slate-500">状态</th>
              <th className="p-4 text-xs text-slate-500">限额</th>
              <th className="p-4 text-xs text-slate-500">操作</th>
            </tr>
          </thead>
          <tbody>
            {keys.map((keyInfo) => (
              <tr key={keyInfo.id} className="border-t border-slate-100">
                <td className="p-4 font-mono text-violet-700">{keyInfo.id}</td>
                <td className="p-4 font-bold text-slate-700">{keyInfo.name}</td>
                <td className="p-4 text-slate-500">{keyInfo.caller}</td>
                <td className="p-4 text-slate-500">{keyInfo.scopes}</td>
                <td className="p-4">
                  <span className="px-2 py-0.5 rounded bg-green-50 text-green-700 text-xs">{keyInfo.status}</span>
                </td>
                <td className="p-4 text-slate-600">
                  <div>{keyInfo.expiry}</div>
                  <div className="text-[10px] text-slate-400">{keyInfo.limit}</div>
                </td>
                <td className="p-4">
                  <button onClick={() => void revoke(keyInfo.id)} className="text-red-500 hover:text-red-700 text-xs flex items-center">
                    <Archive className="w-3.5 h-3.5 mr-1" />
                    停用
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
