import { useEffect, useMemo, useState } from 'react';
import { Download, Search, ShieldCheck } from 'lucide-react';
import { backendApi } from '../services/backendApi';
import type { AuditLog } from '../types/domain';

export function Audit() {
  const [logs, setLogs] = useState<AuditLog[]>([]);
  const [risk, setRisk] = useState<'all' | AuditLog['risk']>('all');
  const [keyword, setKeyword] = useState('');

  useEffect(() => {
    void backendApi.listAuditLogs().then(setLogs);
  }, []);

  const filtered = useMemo(
    () =>
      logs.filter((log) => {
        const matchRisk = risk === 'all' || log.risk === risk;
        const matchKeyword = !keyword || `${log.user}${log.action}${log.resource}${log.detail}`.includes(keyword);
        return matchRisk && matchKeyword;
      }),
    [keyword, logs, risk],
  );

  return (
    <div className="p-6 max-w-7xl mx-auto h-full flex flex-col">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-xl font-bold text-slate-700 flex items-center gap-2">
            <ShieldCheck className="w-6 h-6 text-blue-500" />
            安全审计
          </h1>
          <p className="text-xs text-slate-500 mt-1">系统所有敏感操作、内容生成、权限调整均在此留痕。</p>
        </div>
        <button className="px-3 py-1.5 bg-white border border-slate-200 text-slate-600 text-xs font-semibold rounded flex items-center shadow-sm">
          <Download className="w-3.5 h-3.5 mr-1" />
          导出审计报表
        </button>
      </div>

      <div className="bg-white rounded-lg border border-slate-200 shadow-sm flex flex-col flex-1 overflow-hidden">
        <div className="p-4 border-b bg-slate-50 flex justify-between">
          <div className="flex gap-2">
            {(['all', 'normal', 'warning', 'danger'] as const).map((item) => (
              <button
                key={item}
                onClick={() => setRisk(item)}
                className={`px-3 py-1.5 text-xs rounded border ${risk === item ? 'bg-blue-50 text-blue-700 border-blue-200' : 'bg-white text-slate-500 border-slate-200'}`}
              >
                {item === 'all' ? '全部' : item}
              </button>
            ))}
          </div>
          <div className="relative">
            <Search className="w-3.5 h-3.5 absolute left-2.5 top-2 text-slate-400" />
            <input value={keyword} onChange={(event) => setKeyword(event.target.value)} placeholder="搜索用户、动作、资源..." className="pl-8 pr-3 py-1.5 text-xs border border-slate-200 rounded outline-none w-64" />
          </div>
        </div>
        <div className="overflow-auto custom-scrollbar">
          <table className="w-full text-sm">
            <thead className="bg-slate-50 text-left sticky top-0">
              <tr>
                <th className="p-3 text-xs text-slate-500">时间</th>
                <th className="p-3 text-xs text-slate-500">用户</th>
                <th className="p-3 text-xs text-slate-500">动作</th>
                <th className="p-3 text-xs text-slate-500">资源</th>
                <th className="p-3 text-xs text-slate-500">IP</th>
                <th className="p-3 text-xs text-slate-500">风险</th>
                <th className="p-3 text-xs text-slate-500">详情</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((log) => (
                <tr key={log.id} className="border-t border-slate-100 hover:bg-slate-50">
                  <td className="p-3 text-slate-500 font-mono text-xs">{log.time}</td>
                  <td className="p-3 font-bold text-slate-700">{log.user}<div className="text-[10px] text-slate-400">{log.role}</div></td>
                  <td className="p-3 text-slate-700">{log.action}</td>
                  <td className="p-3 text-slate-600">{log.resource}</td>
                  <td className="p-3 text-slate-500 font-mono text-xs">{log.ip}</td>
                  <td className="p-3"><RiskBadge risk={log.risk} /></td>
                  <td className="p-3 text-slate-500">{log.detail}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

function RiskBadge({ risk }: { risk: AuditLog['risk'] }) {
  const cls = risk === 'danger' ? 'bg-red-50 text-red-700' : risk === 'warning' ? 'bg-orange-50 text-orange-700' : 'bg-green-50 text-green-700';
  return <span className={`px-2 py-0.5 rounded text-xs font-bold ${cls}`}>{risk}</span>;
}
