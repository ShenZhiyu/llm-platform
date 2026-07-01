import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { Anchor, Database, Library } from 'lucide-react';
import { backendApi } from '../services/backendApi';
import type { KnowledgeBase } from '../types/domain';

export function AcousticKB() {
  const [knowledgeBases, setKnowledgeBases] = useState<KnowledgeBase[]>([]);

  useEffect(() => {
    void backendApi.listKnowledgeBases().then(setKnowledgeBases);
  }, []);

  return (
    <div className="p-6 max-w-7xl mx-auto h-full flex flex-col space-y-6">
      <div className="mb-2">
        <h1 className="text-xl font-bold text-slate-700 flex items-center">
          <Anchor className="w-6 h-6 mr-2 text-cyan-600" />
          领域知识库
        </h1>
        <p className="text-xs text-slate-500 mt-1">该页展示后端真实知识库，可进入详情页查看文档和检索测试。</p>
      </div>

      <div className="bg-white rounded-lg border border-slate-200/80 p-6 shadow-sm">
        <div className="flex items-center gap-3">
          <Database className="w-10 h-10 text-cyan-500" />
          <div>
            <h2 className="text-lg font-bold text-slate-700">真实知识库目录</h2>
            <p className="text-xs text-slate-500">文档数和索引状态来自后端数据库。</p>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
        {knowledgeBases.map((kb) => (
          <Link key={kb.id} to={`/kb/${kb.id}`} className="bg-white border border-slate-200 rounded p-4 hover:border-cyan-300 hover:shadow-sm transition-all">
            <div className="flex items-center gap-2 mb-2 font-bold text-slate-700">
              <Library className="w-4 h-4 text-cyan-500" />
              <span className="text-sm">{kb.name}</span>
            </div>
            <p className="text-xs text-slate-500">{kb.department}</p>
            <div className="mt-3 flex gap-2 text-[10px]">
              <span className="px-2 py-0.5 rounded bg-slate-100 text-slate-600">{kb.fileCount} 个文档</span>
              <span className="px-2 py-0.5 rounded bg-green-50 text-green-700">{kb.status}</span>
            </div>
          </Link>
        ))}
      </div>
    </div>
  );
}
