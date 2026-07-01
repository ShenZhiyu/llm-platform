import { useEffect, useState } from 'react';
import { CheckCircle2, FileText, Search, XCircle } from 'lucide-react';
import { useAppContext } from '../AppContext';
import { backendApi } from '../services/backendApi';
import type { Approval } from '../types/domain';

export function ApprovalsTodo() {
  const { user } = useAppContext();
  const [approvals, setApprovals] = useState<Approval[]>([]);

  const reload = async () => {
    const items = await backendApi.listApprovals('todo');
    setApprovals(items.filter((item) => String(item.status).includes('待') || item.status === 'PENDING'));
  };

  useEffect(() => {
    void reload();
  }, []);

  const decide = async (approval: Approval, approved: boolean) => {
    await backendApi.decideApproval(approval.id, approved, user?.id ?? 'u-1001');
    await reload();
  };

  return (
    <div className="p-6 max-w-7xl mx-auto h-full flex flex-col">
      <div className="mb-6">
        <h1 className="text-xl font-bold text-slate-700 flex items-center gap-2">
          <CheckCircle2 className="w-6 h-6 text-rose-500" />
          待我审批
        </h1>
        <p className="text-xs text-slate-500 mt-1">文件入库、知识库授权、模型权限和 API 权限审批均来自后端审批表。</p>
      </div>

      <div className="grid grid-cols-4 gap-4 mb-4">
        {['文件入库', '知识库授权', '模型权限', 'API 权限'].map((type) => (
          <div key={type} className="bg-white border border-slate-200 p-4 rounded-lg flex items-center justify-between shadow-sm">
            <div>
              <span className="text-[10px] uppercase font-bold text-slate-400">{type}</span>
              <h3 className="text-2xl font-bold text-slate-700 mt-1">{approvals.filter((item) => item.type.includes(type.slice(0, 2))).length}</h3>
            </div>
            <div className="p-2 w-10 h-10 flex items-center justify-center bg-blue-50 rounded-full text-blue-500">
              <FileText className="w-5 h-5" />
            </div>
          </div>
        ))}
      </div>

      <div className="bg-white rounded-lg border border-slate-200 shadow-sm flex flex-col flex-1 overflow-hidden">
        <div className="p-4 border-b border-slate-100 bg-slate-50 flex justify-between items-center">
          <div className="font-bold text-sm text-slate-700">审批列表</div>
          <div className="relative">
            <Search className="w-3.5 h-3.5 absolute left-2.5 top-2 text-slate-400" />
            <input placeholder="搜索申请人或目标..." className="pl-8 pr-3 py-1.5 text-xs border border-slate-200 rounded outline-none w-56" />
          </div>
        </div>
        <table className="w-full text-sm">
          <thead className="bg-slate-50 text-left">
            <tr>
              <th className="p-3 text-xs text-slate-500">类型</th>
              <th className="p-3 text-xs text-slate-500">申请人</th>
              <th className="p-3 text-xs text-slate-500">详情</th>
              <th className="p-3 text-xs text-slate-500">风险</th>
              <th className="p-3 text-xs text-slate-500">提交时间</th>
              <th className="p-3 text-xs text-slate-500">操作</th>
            </tr>
          </thead>
          <tbody>
            {approvals.map((approval) => (
              <tr key={approval.id} className="border-t border-slate-100 hover:bg-slate-50">
                <td className="p-3 font-bold text-slate-700">{approval.type}</td>
                <td className="p-3 text-slate-600">{approval.applicant}</td>
                <td className="p-3 text-slate-600">{approval.target}</td>
                <td className="p-3"><span className="px-2 py-0.5 rounded bg-orange-50 text-orange-700 text-xs">{approval.risk}</span></td>
                <td className="p-3 text-slate-500">{approval.createdAt}</td>
                <td className="p-3">
                  <div className="flex gap-2">
                    <button onClick={() => void decide(approval, true)} className="px-2 py-1 rounded bg-blue-600 text-white text-xs"><CheckCircle2 className="w-3 h-3 inline mr-1" />通过</button>
                    <button onClick={() => void decide(approval, false)} className="px-2 py-1 rounded border border-red-200 text-red-700 text-xs"><XCircle className="w-3 h-3 inline mr-1" />驳回</button>
                  </div>
                </td>
              </tr>
            ))}
            {approvals.length === 0 && <tr><td colSpan={6} className="p-8 text-center text-slate-500">暂无待审批事项</td></tr>}
          </tbody>
        </table>
      </div>
    </div>
  );
}
