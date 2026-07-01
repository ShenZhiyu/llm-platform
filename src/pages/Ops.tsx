import { useEffect, useState } from 'react';
import { Activity, Database, Network, ShieldCheck } from 'lucide-react';
import { backendApi } from '../services/backendApi';
import type { OpsStatus } from '../types/domain';

export function Ops() {
  const [status, setStatus] = useState<OpsStatus | null>(null);

  useEffect(() => {
    void backendApi.getOpsStatus().then(setStatus);
  }, []);

  const cards = [
    { label: '数据库状态', value: status?.database ?? '-', icon: Database },
    { label: '模型网关', value: status?.llmGateway ?? '-', icon: Network },
    { label: '已索引文档', value: String(status?.indexedDocuments ?? 0), icon: Activity },
    { label: '待审批', value: String(status?.pendingApprovals ?? 0), icon: ShieldCheck },
  ];

  return (
    <div className="p-6 max-w-7xl mx-auto">
      <div className="mb-6">
        <h1 className="text-xl font-bold text-slate-700">运维监控</h1>
        <p className="text-xs text-slate-500 mt-1">数据来自后端运维状态接口。</p>
      </div>
      <div className="grid grid-cols-4 gap-4 mb-6">
        {cards.map((metric) => (
          <div key={metric.label} className="bg-white border border-slate-200 rounded-lg p-4 shadow-sm flex items-center justify-between">
            <div className="min-w-0">
              <div className="text-[11px] text-slate-400 font-bold">{metric.label}</div>
              <div className="text-lg font-bold text-slate-800 mt-1 truncate">{metric.value}</div>
            </div>
            <div className="w-10 h-10 rounded flex items-center justify-center text-blue-600 bg-blue-50">
              <metric.icon className="w-5 h-5" />
            </div>
          </div>
        ))}
      </div>
      <div className="bg-white border border-slate-200 rounded-lg p-6 shadow-sm">
        <h2 className="font-bold text-slate-800 mb-4">服务状态</h2>
        <div className="space-y-3 text-sm">
          {[
            ['上传存储', status?.uploadStorage],
            ['知识库索引', status?.knowledgeIndex],
            ['审计事件数', String(status?.auditCount ?? 0)],
            ['索引失败文档', String(status?.failedDocuments ?? 0)],
          ].map(([label, value]) => (
            <div key={label} className="flex items-center justify-between border-b border-slate-100 pb-3">
              <span className="text-slate-600">{label}</span>
              <span className="px-2 py-0.5 rounded bg-green-50 text-green-700 text-xs font-bold">{value}</span>
            </div>
          ))}
        </div>
        {(status?.recentErrors.length ?? 0) > 0 && (
          <div className="mt-4 bg-orange-50 border border-orange-100 rounded p-3 text-xs text-orange-700">
            {status?.recentErrors.map((item) => <div key={item}>{item}</div>)}
          </div>
        )}
      </div>
    </div>
  );
}
