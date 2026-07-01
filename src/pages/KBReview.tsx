import { useEffect, useState } from 'react';
import { CheckCircle2, FileSearch, XCircle } from 'lucide-react';
import { useAppContext } from '../AppContext';
import { backendApi } from '../services/backendApi';
import type { Approval, KnowledgeDocument } from '../types/domain';

export function KBReview() {
  const { user } = useAppContext();
  const [documents, setDocuments] = useState<KnowledgeDocument[]>([]);
  const [approvals, setApprovals] = useState<Approval[]>([]);

  const reload = async () => {
    const [docs, aps] = await Promise.all([backendApi.listDocuments(), backendApi.listApprovals('todo')]);
    setDocuments(docs);
    setApprovals(aps.filter((item) => item.relatedDocumentId));
  };

  useEffect(() => {
    void reload();
  }, []);

  const decide = async (approval: Approval, approved: boolean) => {
    await backendApi.decideApproval(approval.id, approved, user?.id ?? 'u-1001');
    await reload();
  };

  const approvalByDocument = new Map<string, Approval>(
    approvals
      .filter((item): item is Approval & { relatedDocumentId: string } => Boolean(item.relatedDocumentId))
      .map((item) => [item.relatedDocumentId, item]),
  );

  return (
    <div className="p-6 max-w-7xl mx-auto">
      <div className="mb-6">
        <h1 className="text-xl font-bold text-slate-700 flex items-center gap-2">
          <FileSearch className="w-6 h-6 text-emerald-500" />
          文件入库审核
        </h1>
        <p className="text-xs text-slate-500 mt-1">文档来自后端上传表，审批通过后触发真实索引。</p>
      </div>

      <div className="bg-white border border-slate-200 rounded-lg shadow-sm overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-slate-50 text-left">
            <tr>
              <th className="p-4 text-xs text-slate-500">文档</th>
              <th className="p-4 text-xs text-slate-500">申请人</th>
              <th className="p-4 text-xs text-slate-500">安全检查</th>
              <th className="p-4 text-xs text-slate-500">索引状态</th>
              <th className="p-4 text-xs text-slate-500">切片数</th>
              <th className="p-4 text-xs text-slate-500">审批状态</th>
              <th className="p-4 text-xs text-slate-500">操作</th>
            </tr>
          </thead>
          <tbody>
            {documents.map((doc) => {
              const approval = approvalByDocument.get(doc.id);
              return (
                <tr key={doc.id} className="border-t border-slate-100">
                  <td className="p-4">
                    <div className="font-bold text-slate-700">{doc.title}</div>
                    <div className="text-xs text-slate-400">{doc.fileName}</div>
                  </td>
                  <td className="p-4 text-slate-600">{doc.applicant}</td>
                  <td className="p-4 text-slate-600">{doc.securityResult}</td>
                  <td className="p-4 text-slate-600">{doc.indexStatus}</td>
                  <td className="p-4 text-slate-600">{doc.chunkCount ?? 0}</td>
                  <td className="p-4 text-slate-600">{approval?.status ?? doc.status}</td>
                  <td className="p-4">
                    {approval && String(approval.status).includes('待') ? (
                      <div className="flex gap-2">
                        <button onClick={() => void decide(approval, true)} className="px-3 py-1 rounded bg-emerald-600 text-white text-xs">
                          <CheckCircle2 className="w-3 h-3 inline mr-1" />通过
                        </button>
                        <button onClick={() => void decide(approval, false)} className="px-3 py-1 rounded border border-red-200 text-red-700 text-xs">
                          <XCircle className="w-3 h-3 inline mr-1" />驳回
                        </button>
                      </div>
                    ) : (
                      <span className="text-xs text-slate-400">无需处理</span>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
