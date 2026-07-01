import { useEffect, useState } from 'react';
import { Eye, FileText, Search } from 'lucide-react';
import { backendApi } from '../services/backendApi';
import type { Approval } from '../types/domain';

export function ApprovalsMy() {
  const [items, setItems] = useState<Approval[]>([]);

  useEffect(() => {
    void backendApi.listApprovals('my').then(setItems);
  }, []);

  return (
    <div className="p-6 max-w-7xl mx-auto h-full flex flex-col space-y-4">
      <div className="mb-2">
        <h1 className="text-xl font-bold text-slate-700 flex items-center">
          <FileText className="w-6 h-6 mr-2 text-indigo-600" />
          我的申请
        </h1>
        <p className="text-xs text-slate-500 mt-1">来自后端审批表的真实申请记录。</p>
      </div>

      <div className="bg-white rounded-lg border border-slate-200/80 shadow-sm flex flex-col flex-1 overflow-hidden">
        <div className="p-4 border-b border-slate-100 bg-slate-50/50 flex justify-between items-center shrink-0">
          <div className="font-bold text-sm text-slate-700">申请记录</div>
          <div className="relative">
            <Search className="w-3.5 h-3.5 absolute left-2.5 top-2 text-slate-400" />
            <input type="text" placeholder="搜索申请内容..." className="pl-8 pr-3 py-1.5 text-xs border border-slate-200 rounded outline-none w-48" />
          </div>
        </div>

        <div className="flex-1 overflow-auto custom-scrollbar">
          <table className="w-full text-left border-collapse">
            <thead className="bg-slate-50/80 sticky top-0 z-10 shadow-sm">
              <tr>
                <th className="p-3 text-[11px] font-bold text-slate-500 border-b border-slate-200 uppercase w-40">申请编号</th>
                <th className="p-3 text-[11px] font-bold text-slate-500 border-b border-slate-200 uppercase w-32">类型</th>
                <th className="p-3 text-[11px] font-bold text-slate-500 border-b border-slate-200 uppercase">申请内容</th>
                <th className="p-3 text-[11px] font-bold text-slate-500 border-b border-slate-200 uppercase w-28">状态</th>
                <th className="p-3 text-[11px] font-bold text-slate-500 border-b border-slate-200 uppercase w-36">提交时间</th>
                <th className="p-3 text-[11px] font-bold text-slate-500 border-b border-slate-200 uppercase w-24">操作</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 text-xs text-slate-600">
              {items.map((item) => (
                <tr key={item.id} className="hover:bg-slate-50 transition-colors">
                  <td className="p-3 font-mono text-slate-500">{item.id}</td>
                  <td className="p-3 font-bold text-slate-700">{item.type}</td>
                  <td className="p-3 text-slate-600 truncate" title={item.target}>{item.target}</td>
                  <td className="p-3"><span className="px-2 py-1 rounded text-[10px] font-bold bg-slate-100 text-slate-600">{item.status}</span></td>
                  <td className="p-3 text-slate-500">{item.createdAt}</td>
                  <td className="p-3"><span className="text-indigo-600 font-bold flex items-center"><Eye className="w-3.5 h-3.5 mr-1" />详情</span></td>
                </tr>
              ))}
            </tbody>
          </table>
          {items.length === 0 && <div className="p-8 text-center text-slate-400 text-xs">暂无申请记录</div>}
        </div>
      </div>
    </div>
  );
}
