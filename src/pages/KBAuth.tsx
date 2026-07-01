import { useEffect, useMemo, useState } from 'react';
import { CheckCircle2, ShieldCheck, XCircle } from 'lucide-react';
import { useAppContext } from '../AppContext';
import { backendApi } from '../services/backendApi';
import type { Approval, KnowledgeBase } from '../types/domain';

export function KBAuth() {
  const { user } = useAppContext();
  const [approvals, setApprovals] = useState<Approval[]>([]);
  const [knowledgeBases, setKnowledgeBases] = useState<KnowledgeBase[]>([]);
  const [selectedKb, setSelectedKb] = useState('');
  const [reason, setReason] = useState('申请跨部门知识库访问');

  const reload = async () => {
    const [approvalItems, kbItems] = await Promise.all([backendApi.listApprovals('todo'), backendApi.listKnowledgeBases()]);
    setApprovals(approvalItems.filter((item) => item.type.includes('授权') || item.type.includes('KB') || item.target.includes('知识库')));
    setKnowledgeBases(kbItems);
    setSelectedKb((current) => current || kbItems[0]?.id || '');
  };

  useEffect(() => {
    void reload();
  }, []);

  const pending = useMemo(() => approvals.filter((item) => String(item.status).includes('待') || item.status === 'PENDING'), [approvals]);

  const submitRequest = async () => {
    if (!user || !selectedKb) return;
    await backendApi.requestKnowledgeBaseAccess(selectedKb, user.id, reason);
    await reload();
  };

  const decide = async (approval: Approval, approved: boolean) => {
    await backendApi.decideApproval(approval.id, approved, user?.id ?? 'u-1001');
    await reload();
  };

  return (
    <div className="p-6 max-w-6xl mx-auto space-y-6">
      <div>
        <h1 className="text-xl font-bold text-slate-700 flex items-center gap-2">
          <ShieldCheck className="w-6 h-6 text-blue-500" />
          知识库权限与授权
        </h1>
        <p className="text-xs text-slate-500 mt-1">授权申请、审批和授权结果均写入后端数据库。</p>
      </div>

      <div className="bg-white border border-slate-200 rounded-lg shadow-sm p-4">
        <div className="font-bold text-sm text-slate-700 mb-3">发起授权申请</div>
        <div className="grid grid-cols-[1fr_2fr_auto] gap-3">
          <select value={selectedKb} onChange={(event) => setSelectedKb(event.target.value)} className="border border-slate-200 rounded px-3 py-2 text-sm">
            {knowledgeBases.map((kb) => <option key={kb.id} value={kb.id}>{kb.name}</option>)}
          </select>
          <input value={reason} onChange={(event) => setReason(event.target.value)} className="border border-slate-200 rounded px-3 py-2 text-sm" />
          <button onClick={() => void submitRequest()} className="px-4 py-2 bg-blue-600 text-white rounded text-sm">提交申请</button>
        </div>
      </div>

      <div className="bg-white border border-slate-200 rounded-lg shadow-sm overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-slate-50 text-left">
            <tr>
              <th className="p-4 text-xs text-slate-500">申请人</th>
              <th className="p-4 text-xs text-slate-500">申请目标</th>
              <th className="p-4 text-xs text-slate-500">风险</th>
              <th className="p-4 text-xs text-slate-500">状态</th>
              <th className="p-4 text-xs text-slate-500">操作</th>
            </tr>
          </thead>
          <tbody>
            {pending.map((approval) => (
              <tr key={approval.id} className="border-t border-slate-100">
                <td className="p-4 font-bold text-slate-700">{approval.applicant}</td>
                <td className="p-4 text-slate-600">{approval.target}</td>
                <td className="p-4"><span className="px-2 py-0.5 rounded bg-green-50 text-green-700 text-xs">{approval.risk}</span></td>
                <td className="p-4 text-slate-500">{approval.status}</td>
                <td className="p-4">
                  <div className="flex gap-2">
                    <button onClick={() => void decide(approval, true)} className="px-3 py-1 rounded bg-blue-600 text-white text-xs">
                      <CheckCircle2 className="w-3 h-3 inline mr-1" />通过
                    </button>
                    <button onClick={() => void decide(approval, false)} className="px-3 py-1 rounded border border-red-200 text-red-700 text-xs">
                      <XCircle className="w-3 h-3 inline mr-1" />驳回
                    </button>
                  </div>
                </td>
              </tr>
            ))}
            {pending.length === 0 && <tr><td colSpan={5} className="p-8 text-center text-slate-500">暂无待审批授权申请</td></tr>}
          </tbody>
        </table>
      </div>
    </div>
  );
}
