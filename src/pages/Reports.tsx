import { useEffect, useState } from 'react';
import { AlertTriangle, Download, FileSpreadsheet, PieChart } from 'lucide-react';
import { backendApi } from '../services/backendApi';
import type { ReportSummary } from '../types/domain';

export function Reports() {
  const [summary, setSummary] = useState<ReportSummary | null>(null);

  useEffect(() => {
    void backendApi.getReportSummary().then(setSummary);
  }, []);

  const cards = [
    ['会话数', summary?.chatSessions ?? 0],
    ['消息数', summary?.chatMessages ?? 0],
    ['输入 Token', summary?.inputTokens ?? 0],
    ['输出 Token', summary?.outputTokens ?? 0],
    ['知识库', summary?.knowledgeBases ?? 0],
    ['文档', summary?.documents ?? 0],
    ['待审批', summary?.approvalsPending ?? 0],
    ['模型失败', summary?.modelFailures ?? 0],
  ];

  return (
    <div className="p-6 max-w-7xl mx-auto h-full flex flex-col space-y-6">
      <div className="mb-2">
        <h1 className="text-xl font-bold text-slate-700 flex items-center">
          <PieChart className="w-6 h-6 mr-2 text-emerald-600" />
          报表与分析
        </h1>
        <p className="text-xs text-slate-500 mt-1">统计数据来自后端真实表聚合。</p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        {cards.map(([label, value]) => (
          <div key={label} className="bg-white border border-slate-200/80 p-4 rounded-lg flex items-center justify-between shadow-sm">
            <div>
              <span className="text-[10px] uppercase font-bold text-slate-400">{label}</span>
              <h3 className="font-bold text-2xl text-slate-700">{value}</h3>
            </div>
            <div className="p-2 bg-slate-50 rounded text-slate-500"><FileSpreadsheet className="w-5 h-5" /></div>
          </div>
        ))}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 flex-1 min-h-0">
        <div className="bg-white border border-slate-200/80 rounded-lg shadow-sm p-5">
          <div className="flex items-center justify-between mb-4">
            <h3 className="font-bold text-slate-700 text-sm">审批状态</h3>
            <button className="text-xs text-slate-500 flex items-center"><Download className="w-3 h-3 mr-1" />导出</button>
          </div>
          <div className="space-y-3 text-sm">
            <Metric label="待审批" value={summary?.approvalsPending ?? 0} />
            <Metric label="已通过" value={summary?.approvalsApproved ?? 0} />
            <Metric label="已驳回" value={summary?.approvalsRejected ?? 0} />
          </div>
        </div>

        <div className="bg-white border border-slate-200/80 rounded-lg shadow-sm p-5">
          <h3 className="font-bold text-slate-700 text-sm mb-4">风险提示</h3>
          <div className="p-4 bg-orange-50/50 border border-orange-100 rounded flex gap-3">
            <AlertTriangle className="w-5 h-5 text-orange-500 shrink-0" />
            <div>
              <h4 className="text-xs font-bold text-orange-800 mb-1">模型失败次数：{summary?.modelFailures ?? 0}</h4>
              <p className="text-[11px] text-orange-700/80">该指标来自审计日志中的模型网关失败记录。</p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

function Metric({ label, value }: { label: string; value: number }) {
  return (
    <div className="flex items-center justify-between border-b border-slate-100 pb-3">
      <span className="text-slate-600">{label}</span>
      <span className="font-bold text-slate-800">{value}</span>
    </div>
  );
}
